# Case técnico independente — análise de decisões judiciais com IA

Demonstração de uma solução de AI Deployment para transformar textos de decisões em dados estruturados e apoiar a priorização de revisão humana. O fluxo separa extração assistida por LLM das validações, cálculos e auditorias determinísticas.

Este repositório é uma **adaptação independente para portfolio** de um exercício técnico realizado durante um processo seletivo para AI Deployment na Enter. Não é produto, código interno, material oficial ou solução endossada pela Enter.

## O que está demonstrado

- contrato de saída estruturada para a etapa de extração;
- validação e normalização do resultado por processo;
- atualização monetária e juros simples com aritmética em centavos;
- estimativa econômica de recurso com premissas explícitas;
- auditoria de integridade e reconciliação dos valores;
- exportação de planilha CSV e síntese executiva.

A fronteira de IA está representada por uma fixture de extrações. Nenhuma chamada de modelo é feita nesta demonstração; o restante do pipeline funciona sobre esses dados e aplica regras determinísticas.

## Estrutura

- `src/pipeline.mjs`: validação, cálculos, recomendação, auditoria e exportações.
- `src/run-demo.mjs`: composição da demonstração e geração dos artefatos.
- `data/synthetic/`: entradas ficcionais criadas para este portfolio.
- `outputs/`: exemplo de saída gerado exclusivamente a partir das entradas sintéticas.
- `architecture.mmd`: diagrama do fluxo lógico.

## Premissas da demonstração

Os identificadores `DEMO-*`, textos, valores, índices, probabilidades e custos são inventados. Não representam processos reais, dados de cliente ou parâmetros oficiais. A recomendação é uma heurística econômica didática: não avalia cabimento jurídico, prazo, provimento parcial ou risco processual e não substitui revisão humana.

O material fornecido no processo seletivo — enunciado, fluxo-base, sentenças, tabelas e outputs do exercício — não está incluído neste repositório. O código e a documentação desta versão foram reescritos para demonstração pública.

## Direitos e atribuição

O case original foi proposto pela Enter; a solução demonstrativa deste repositório é independente e de autoria do candidato. Não há afiliação ou endosso da Enter. Este repositório não concede licença para reutilizar ou explorar o código. Marcas de terceiros pertencem a seus titulares.
