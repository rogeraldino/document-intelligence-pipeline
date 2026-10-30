const OUTCOMES = new Set(['full_award', 'partial_award', 'dismissed', 'terminated']);
const EVIDENCE = new Set(['complete', 'partial', 'missing']);

const toCents = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid non-negative amount: ${value}`);
  return Math.round((number + Number.EPSILON) * 100);
};
const fromCents = cents => Number((cents / 100).toFixed(2));
const roundCents = value => Math.round(value + Number.EPSILON);

function completeMonths(start, end) {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.valueOf()) || Number.isNaN(b.valueOf()) || a > b) {
    throw new Error(`Invalid date interval: ${start} → ${end}`);
  }
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

export function splitIntoBatches(items, maxSize = 10) {
  if (!Number.isInteger(maxSize) || maxSize < 1) throw new Error('maxSize must be a positive integer');
  return Array.from({ length: Math.ceil(items.length / maxSize) }, (_, i) => items.slice(i * maxSize, (i + 1) * maxSize));
}

function normalizeCase(item, rules) {
  if (!item?.case_id || !/^DEMO-[0-9]{3}$/.test(item.case_id)) throw new Error('Only synthetic DEMO-* identifiers are accepted');
  if (!OUTCOMES.has(item.outcome)) throw new Error(`Unsupported outcome for ${item.case_id}`);
  if (!EVIDENCE.has(item.evidence_status)) throw new Error(`Unsupported evidence status for ${item.case_id}`);

  const material = toCents(item.material_damages);
  const moral = toCents(item.moral_damages);
  const awarded = item.outcome === 'full_award' || item.outcome === 'partial_award';
  if (!awarded && (material !== 0 || moral !== 0)) throw new Error(`Non-award case ${item.case_id} has damages`);

  let correctedPrincipal = 0;
  let interest = 0;
  let months = 0;
  const baseCents = material + moral;
  if (awarded) {
    const baseIndex = Number(rules.monthly_indices[item.correction_start_month]);
    const referenceMonth = rules.reference_date.slice(0, 7);
    const referenceIndex = Number(rules.monthly_indices[referenceMonth]);
    if (!(baseIndex > 0) || !(referenceIndex > 0)) throw new Error(`Missing index for ${item.case_id}`);
    if (!item.citation_date) throw new Error(`Missing citation date for ${item.case_id}`);
    correctedPrincipal = roundCents(baseCents * referenceIndex / baseIndex);
    months = completeMonths(item.citation_date, rules.reference_date);
    interest = roundCents(correctedPrincipal * rules.monthly_simple_interest_rate * months);
  }

  const updated = correctedPrincipal + interest;
  const configuredCost = rules.appeal_cost_by_court[item.court_code];
  if (awarded && configuredCost === undefined) throw new Error(`Missing appeal cost scenario for ${item.case_id}`);
  const appealCost = awarded ? toCents(configuredCost) : 0;
  const probability = Number(rules.reversal_probability_by_evidence_status[item.evidence_status]);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error(`Invalid reversal scenario for ${item.case_id}`);
  const expectedBenefit = awarded ? roundCents(updated * probability) : 0;
  const expectedNet = awarded ? expectedBenefit - appealCost : 0;
  const recommendation = !awarded ? 'not_applicable' : expectedNet > 0 ? 'review_appeal' : 'do_not_prioritize';
  const nearBreakEven = awarded && expectedNet > 0 && expectedNet / Math.max(appealCost, 1) <= rules.human_review_margin_ratio;

  return {
    case_id: item.case_id,
    outcome: item.outcome,
    evidence_status: item.evidence_status,
    material_damages: fromCents(material),
    moral_damages: fromCents(moral),
    extracted_award: fromCents(toCents(item.extracted_award ?? fromCents(baseCents))),
    validated_award: fromCents(baseCents),
    extraction_adjusted: toCents(item.extracted_award ?? fromCents(baseCents)) !== baseCents,
    correction_start_month: item.correction_start_month,
    citation_date: item.citation_date,
    months_of_interest: months,
    corrected_principal: fromCents(correctedPrincipal),
    simple_interest: fromCents(interest),
    updated_award: fromCents(updated),
    appeal_cost: fromCents(appealCost),
    reversal_probability: probability,
    expected_benefit: fromCents(expectedBenefit),
    expected_net: fromCents(expectedNet),
    recommendation,
    human_review_flag: nearBreakEven,
    calculation_reconciles: correctedPrincipal + interest === updated,
    dispositive_excerpt: String(item.dispositive_excerpt ?? '')
  };
}

export function runPortfolio(extractions, rules) {
  if (!Array.isArray(extractions) || extractions.length === 0) throw new Error('No extraction records provided');
  if (!rules?.reference_date || !rules?.monthly_indices) throw new Error('Calculation rules are incomplete');
  const batches = splitIntoBatches(extractions, rules.max_batch_size ?? 10);
  const seen = new Set();
  const cases = extractions.map(item => {
    if (seen.has(item.case_id)) throw new Error(`Duplicate case id: ${item.case_id}`);
    seen.add(item.case_id);
    return normalizeCase(item, rules);
  });
  const auditErrors = cases.filter(item => !item.calculation_reconciles).map(item => `${item.case_id}: financial reconciliation failed`);
  if (cases.length !== extractions.length) auditErrors.push('Input/output count mismatch');

  const awards = cases.filter(item => item.outcome === 'full_award' || item.outcome === 'partial_award');
  const totalUpdated = awards.reduce((sum, item) => sum + toCents(item.updated_award), 0);
  const expectedAppealNet = awards.reduce((sum, item) => sum + Math.round(item.expected_net * 100), 0);
  const audit = {
    status: auditErrors.length ? 'review_required' : 'passed',
    input_count: extractions.length,
    output_count: cases.length,
    batch_count: batches.length,
    max_batch_size: rules.max_batch_size ?? 10,
    duplicate_ids: false,
    financial_reconciliation: cases.every(item => item.calculation_reconciles),
    errors: auditErrors
  };
  return {
    reference_date: rules.reference_date,
    cases,
    summary: {
      total_cases: cases.length,
      cases_with_award: awards.length,
      cases_without_current_award: cases.length - awards.length,
      updated_award_exposure: fromCents(totalUpdated),
      extraction_adjustments: cases.filter(item => item.extraction_adjusted).length,
      cases_to_prioritize_for_human_appeal_review: cases.filter(item => item.recommendation === 'review_appeal').length,
      near_break_even_human_review: cases.filter(item => item.human_review_flag).length,
      expected_net_across_scenarios: fromCents(expectedAppealNet)
    },
    audit
  };
}

export function toCsv(cases) {
  const columns = ['id_demo','resultado','status_evidencias','valor_extraido_llm','valor_validado','ajuste_aplicado','principal_corrigido','juros_simples','condenacao_atualizada','custo_recurso','probabilidade_reversao','beneficio_esperado','resultado_liquido_esperado','encaminhamento_economico','revisao_humana'];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.map(quote).join(';'), ...cases.map(row => columns.map(key => quote(row[key])).join(';'))].join('\n') + '\n';
}

export function toExecutiveSummary(result) {
  const s = result.summary;
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  return `# Resumo sintético da carteira\n\nData de referência: ${result.reference_date}\n\n- Casos processados: ${s.total_cases}\n- Casos com condenação: ${s.cases_with_award}\n- Casos sem condenação atual: ${s.cases_without_current_award}\n- Divergências de extração recalculadas: ${s.extraction_adjustments}\n- Exposição atualizada demonstrativa: ${money(s.updated_award_exposure)}\n- Casos sugeridos para revisão humana de recurso: ${s.cases_to_prioritize_for_human_appeal_review}\n- Casos próximos ao ponto de equilíbrio sinalizados: ${s.near_break_even_human_review}\n- Resultado líquido esperado nos cenários fictícios: ${money(s.expected_net_across_scenarios)}\n\n> Demonstração matemática com premissas inventadas. Não é orientação jurídica nem recomendação para processos reais.\n`;
}
