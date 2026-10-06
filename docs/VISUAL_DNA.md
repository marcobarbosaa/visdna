# Contrato Visual DNA 2.0

`src/types.ts` define `VisualDNA = VisualDNAV1 | VisualDNAV2`. O contrato V2 está em `src/analysis/semantic/types.ts`. O discriminador é `schemaVersion`; consumidores devem aceitar campos desconhecidos e valores `null`.

## Pipeline e responsabilidades

```text
Chromium / transporte seguro
  → DOM + computed styles + desktop/mobile + frames + screenshots
  → normalização e candidatos técnicos (analysis/raw.ts)
  → módulos puros de analysis/semantic/
  → Visual DNA 2.0 + analysis.raw.json
```

`browser/engine.ts` mantém navegação, limites, screenshots e isolamento. `browser/collect.ts` coleta propriedades e relações, sem copiar textos. `analysis/normalize.ts` e `analysis/components.ts` continuam fornecendo frequências e candidatos legados. `analysis/raw.ts` preserva a análise V1, inclusive heurísticas antigas, exclusivamente para diagnóstico/regressão. Não use seus rótulos como inferências V2.

`buildAnalysis(capture, url, stage)` retorna `{ raw, dna }`. `buildDNA(...)` retorna apenas V2. Os módulos semânticos produzem cores, tipografia, spacing, layout, famílias, responsividade, motion e identidade. Não há chamada de IA nem dependência nova.

O worker escreve RAW atomicamente antes de enviar a conclusão com DNA ao servidor. O storage continua salvando `record.json`, com o DNA refinado, e PNGs locais. RAW fica em `analysis.raw.json`, separado do registro e do histórico. Retenção e remoção do diretório eliminam os dois artefatos juntos.

## Artefatos e API

| Recurso                     | Contrato                                                       |
| --------------------------- | -------------------------------------------------------------- |
| `GET /api/analyses/:id/dna` | Download V1 ou V2 conforme o registro, sem conversão implícita |
| `GET /api/analyses/:id/raw` | RAW 2.0 de análises completas; 404 para V1/ausente             |
| `GET /api/analyses/:id`     | Registro com `dna` discriminado por versão                     |
| `GET /api/analyses`         | Metadados e `hasDNA`, sem DNA nem RAW                          |

RAW tem `schemaVersion: "raw-2.0"`, `capture` (estados DOM, retângulos, estilos, relações, frames, avisos, URL final) e `normalized` (contrato técnico V1, frequências, candidatos, evidências). Não contém imagens embutidas, texto original ou HTML. Screenshots permanecem arquivos separados.

## Campos V2

| Campo                    | Conteúdo                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                 | URL solicitada, instante de geração, larguras capturadas                                                                               |
| `methodology`            | Amostragem, truncamento, unidades e avisos                                                                                             |
| `identity`               | Tema, densidade e características mensuráveis com evidências                                                                           |
| `colors.palette`         | Famílias perceptuais, membros, ocorrências, cobertura estimada de fundos, luminância e chroma                                          |
| `colors.roles`           | background, surface, surfaceSecondary, primary, secondary, accent, textPrimary, textSecondary, muted, border, success, warning, danger |
| `typography.roles`       | display, h1–h4, bodyLarge, body, small, caption, label; family/size/weight/lineHeight/tracking                                         |
| `typography.personality` | Densidade de entrelinha, contraste heading/body e pesos                                                                                |
| `spacing`                | Unidade base, valores dominantes, tokens e contextos component/section/container/inline                                                |
| `tokens`                 | Registros colors, typography, spacing, radius, shadows e motion                                                                        |
| `layout`                 | Regiões significativas e container desktop observado                                                                                   |
| `componentFamilies`      | Tipo, instâncias, dimensões típicas, anatomia, estilo e distribuição                                                                   |
| `responsive`             | Estados observados, correspondências aproximadas, containers e mudanças agregadas                                                      |
| `motion`                 | Padrões de declarações e mudanças observadas, tokens de duração                                                                        |
| `designSummary`          | Frases determinísticas; campos sem suporte são omitidos                                                                                |
| `confidence`             | Método e cobertura de papéis de cor; não é probabilidade global de acerto                                                              |

Inferências usam `Finding<T> = { value: T | null, confidence: number, evidence: string[] }`. Regiões, famílias e padrões usam `type` como valor discriminante, com confiança/evidências no mesmo objeto. Não há IDs DOM nem caixas individuais no DNA V2.

## Confiança e abstinência

`confidence.ts` centraliza o cálculo: média dos suportes independentes (limitados a 0–1), multiplicada por `0.6 + 0.4 × min(observações / 4, 1)`. Exige dois sinais positivos e média ≥ 0.55. Sem isso, retorna `value: null`, `confidence: 0` e explicação. São escores heurísticos, **não probabilidades calibradas**. Confiança alta não prova intenção do designer.

- Primary requer duas ações distintas, recorrência/contexto e contraste. Duas propriedades do mesmo botão não contam como dois botões. Candidatos com pontuação a menos de 20% um do outro deixam primary/secondary desconhecidos.
- Accent pode vir de links, ações, texto enfatizado e badges em regiões distintas. Primary e accent podem coincidir.
- Surface requer caixas de conteúdo repetidas; fundos de botões são excluídos. Papéis distintos podem resolver para a mesma cor.
- Bordas com largura zero não fornecem evidência. Success/warning/danger ficam desconhecidos: falta semântica confiável de estado.
- Hero exige posição inicial, altura entre 28% e 150% da viewport, título proeminente e ação. Só um hero é escolhido. Split exige dois grupos substanciais lado a lado; mídia sobreposta não vira split.
- Títulos sem tags heading consideram tamanho, peso, comprimento e texto menor abaixo no mesmo grupo. Cards exigem duas instâncias equivalentes. Pricing/testimonial e setor comercial não são adivinhados.

## Cores e cobertura

As conversões seguem [CSS Color 4, conversões e diferenças de cor](https://www.w3.org/TR/css-color-4/#color-conversion-code). O parser puro aceita hex 3/4/6/8, rgb/rgba numérico ou percentual, hsl/hsla, lab/lch, oklab/oklch e `color(srgb|srgb-linear|display-p3|xyz|xyz-d50|xyz-d65 ...)`. Hue aceita graus, radianos, grad e turn. Sintaxes relativas, `calc()`, `none`, palavras-chave e outros perfis não são interpretados; computed styles normalmente resolvem nomes CSS.

Comparação por distância euclidiana OKLab (ΔEOK), limiar 0.035 e diferença máxima de alpha 0.03. O representante é fixo durante agrupamento: não há encadeamento transitivo de cores distantes. Valores fora do gamut sRGB mantêm sua representação CSS. Transparência não é misturada com opacidade. Ordenação por frequência e desempate lexical tornam o clustering independente da ordem DOM.

`occurrenceFrequency` é percentual de ocorrências úteis antes do limite de candidatos. `count` é absoluto. `visualCoverageEstimate` é percentual de uma grade 32 × 64 na página completa, preenchida por caixas de fundo opaco em ordem DOM. O último fundo sobreposto vence, evitando somar a mesma área. Fundos semitransparentes não cobrem células. Após agrupar, a cor exibida prioriza cobertura e depois ocorrências.

Essa cobertura **não mede pixels, texto ou imagens**. Não reproduz z-index, recortes, gradientes, blending, oclusão, pseudo-elementos ou canvas. Pequenas caixas podem ocupar uma célula inteira. A soma pode diferir de 100% por arredondamento e cores excluídas. Contraste usa representantes opacos; não é auditoria de acessibilidade.

## Tokens, componentes e performance

- Spacing preserva múltiplos de 2 px. Infere a maior unidade entre 8/4/2 com ≥85% de suporte ponderado e três valores recorrentes. Nomes observacionais `space16`, sem fabricar xs/sm/md ou passos ausentes.
- Radius/shadow agrupam valores exatos repetidos (`radius1`, `shadow1`); numeração estável só no documento. Não há clustering perceptual de sombras.
- Referências: `{ token: "spacing.space16", resolved: 16 }`. `token: null` preserva valores locais. Todos os caminhos referenciados existem no documento.
- Famílias usam anatomia, cor perceptual, estilo e dimensões quantizadas em 32 px. Alturas muito diferentes podem separar componentes. IDs ficam no RAW.
- Motion normaliza s/ms, agrupa propriedade/duração/easing e separa declarações de opacity/transform/filter observado. Tokens `duration200` não impõem velocidade subjetiva.
- Índices evitam buscas desktop/mobile e frames quadráticas. Limites: 32 ancestrais, 240 descendentes/irmãos de contexto, 256 cores por frequência antes do clustering, 32 regiões, 40 famílias/padrões, 12 tokens de estilo. Captura mantém 1.800 elementos/12.000 nós.
- Dois estados não revelam breakpoints. Correspondência exige ID/tag/pai/role; páginas dinâmicas ainda podem produzir correspondências falsas ou faltar na amostra.

## Compatibilidade, visão futura e warnings

Registros V1 continuam legíveis pelo renderer legado. Sem migração automática ou backfill de RAW. Novas análises/downloads usam V2. A UI mantém estrutura/CSS e usa renderer separado para V2.

`VisionAnalyzer` define uma extensão futura: screenshots desktop/mobile, RAW e DNA determinístico → interpretações com evidências/proveniência. Não há implementação, chamada externa, custo, execução automática ou merge de afirmações.

`MAIN DOCUMENT ERROR` encerra a análise por erro de navegação no frame principal. HTTP 4xx/5xx ou falhas secundárias (inclusive iframes) geram `SECONDARY RESOURCE WARNING`, agregados por status/categoria segura, sem URLs ou parâmetros. Só uma captura concluída afirma sucesso do documento principal.

## Referência histórica: contrato Visual DNA 1.0

O restante desta seção documenta exclusivamente registros antigos e `raw.normalized`.

O contrato TypeScript está em `src/types.ts`. `buildDNA` é a fronteira entre dados de captura e interpretação: pode ser executado com capturas sintéticas sem abrir um navegador.

| Campo                              | Conteúdo                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `schemaVersion`                    | Versão literal `1.0`.                                                             |
| `source`                           | URL de entrada, instante de geração e viewports.                                  |
| `methodology`                      | Contagem de elementos, truncamento, unidade de frequência e avisos.               |
| `colors.palette`                   | Cores RGB/RGBA/hex normalizadas, frequência e contagem.                           |
| `colors.roles`                     | Valor ou `null`, confiança 0–1 e evidências.                                      |
| `typography`                       | Famílias declaradas, pesos, tamanhos, line-height, tracking e escala heurística.  |
| `spacing`                          | Valores px agrupados a cada 2 px.                                                 |
| `radius`, `shadows`, `backgrounds` | Tokens recorrentes.                                                               |
| `containers`                       | Max-width declarado ou largura medida arredondada em 8 px.                        |
| `layout`                           | Grid/flex, colunas resolvidas, gaps, alinhamentos, larguras e rótulos candidatos. |
| `components`                       | Tipo, ID local, confiança, evidência, estilo selecionado e retângulo.             |
| `motion`                           | CSS declarado e padrões candidatos observados entre frames.                       |
| `responsive`                       | Duas larguras amostradas e diferenças de propriedades.                            |

Frequências contam ocorrências nas propriedades selecionadas **antes** do corte top-k. Portanto, as frequências dos tokens exportados podem somar menos de 100%. Elas não medem área visual nem importância perceptual.

IDs `eN` são relativos à posição do elemento na amostra DOM. Não são seletores persistentes do site e não devem ser comparados entre análises independentes. A comparação entre viewports é aproximada quando a página muda a estrutura DOM.

As famílias tipográficas não indicam se a fonte foi efetivamente baixada. Os papéis Display/H1/H2 etc. são inferidos principalmente a partir do tamanho de texto visível; não garantem correspondência com a semântica HTML. As confianças são pesos heurísticos, não probabilidades calibradas.

O JSON não contém HTML, texto original, regras CSS completas, imagens ou fontes. O URL de origem é preservado para rastreabilidade. Screenshots são artefatos locais relacionados ao registro, fora do contrato de DNA.

Mudanças incompatíveis devem incrementar a versão principal; novos campos opcionais podem evoluir numa versão secundária. Consumidores devem tolerar campos desconhecidos e valores `null`.
