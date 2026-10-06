# Contrato Visual DNA 2.0

`src/types.ts` define `VisualDNA = VisualDNAV1 | VisualDNAV2`. O contrato V2 está em `src/analysis/semantic/types.ts`. O discriminador é `schemaVersion`; consumidores devem aceitar campos desconhecidos e valores `null`.

## Evolução: captura progressiva e movimento visual

Os novos campos são aditivos no contrato de captura/registro. As chaves e discriminadores existentes do DNA 2.0 não foram traduzidos nem substituídos. `web/i18n.js` apresenta rótulos e evidências em PT-BR; a aba JSON preserva o contrato original.

- `Capture.screenshots` e `AnalysisRecord.artifacts`: flags desktop/mobile/fullPage (e RAW no registro), mais `segments[]` com `index`, `file`, `startY`, `endY`, `width`. Detalhe e listagem da API verificam cada arquivo antes de informar disponibilidade. A rota de imagens aceita somente nomes fixos e `segment-000.jpg` a `segment-019.jpg`.
- `captureCoverage`: DOM (contagem inicial/adicional, amostra/truncamento), scroll (posições reais, união das faixas, fim alcançado, motivo de parada), mobile independente, screenshots (cobertura vertical/horizontal) e motion (checkpoints, canvas, estados observados e limitação). Ausência em registros antigos significa desconhecido.
- `Capture.canvasRegions`: regiões canvas com geometria, position/zIndex/opacity/transform e `visualStateObserved`. `visualStates[]` contém amostras por checkpoint, chegada/estabilização, faixa de scroll, regiões estruturais e assinatura RGB 16×16. `mobileFrames` preserva a observação mobile.
- Snapshot acumula elementos até 1.800 e inspeciona até 12.000 nós por coleta com TreeWalker limitado. WeakMap mantém identidade entre scroll e viewport, mesmo com inserção anterior no DOM; nós recriados ganham outro ID. O primeiro estado útil é canônico, estados transparentes podem ser atualizados e frames registram mudanças. Não multiplica elementos conhecidos a cada checkpoint.
- `layout.viewportWidth`, `pageShellWidth`, `contentContainerWidth` separam viewport, estrutura externa e conteúdo. `desktopContainer` permanece como alias compatível da inferência de conteúdo. Elementos praticamente full-width não bastam como evidência.
- Spacing adiciona `observed` e `sectionSpacing`; só gera tokens recorrentes de até 96 px quando uma escala tem suporte. Radius normaliza geometria plenamente arredondada para `pill`/`circle`, conservando CSS original no RAW. Foreground/background/border de famílias são agrupados e resolvidos independentemente. Papéis secondary/accent não compartilham somente evidência da mesma ação.
- Typography responsiva mantém resultado desconhecido para reduções improváveis (tamanhos inferiores a 8 px ou razão mobile/desktop inferior a 0,55 no corpo e 0,3 nos títulos em mais de 25% dos pares). Estes limites são sanidade heurística, não regras universais de design.

### Percurso e limites

Desktop: até 20 checkpoints, 24 s de percurso e corte até 45 s após início. Mobile: até 6 checkpoints, 7 s e corte até 55 s. Frames reais duplos com escape de 160 ms, mais 100 ms de estabilização. Passos de aproximadamente 90% da viewport com sobreposição; se necessário, distância maior para alcançar o fim dentro do orçamento. A altura é consultada novamente para considerar lazy loading. Lacunas permanecem na métrica de cobertura: não se presume observar pixels atravessados por um salto. Páginas infinitas podem atingir limite e retornar parcial. Browser continua com 60 s e supervisor com 75 s.

Até 24 MiB de imagens por captura. PNG desktop/mobile e integral opcional, JPEG 75 nos segmentos, sem imagem gigante obrigatória. Integral somente até 2.400×12.000 px, com dimensões novamente verificadas antes da captura. A imagem principal é reutilizada como primeiro segmento; segmentos redundantes são apagados se a integral foi produzida. RAW, imagens e registro compartilham retenção; não há arquivos PNG temporários de comparação no disco.

### Evidência visual e causalidade

Screenshots regionais visíveis são decodificados em uma página isolada, offline, sem scripts remotos. Comparam-se vetores RGB reduzidos por diferença absoluta média normalizada: ≥0,035 para mudança; <0,015 para estabilidade do controle sem scroll. Dimensões de recorte devem coincidir com tolerância de 2 px. Até 3 canvas por checkpoint e 120 estados, memória limitada a pequenos vetores persistidos no RAW. Falha de captura significa `visualStateObserved: false`, não canvas estático.

`canvas-visual-change` indica diferença visual observada. `scroll-reactive-region` exige pelo menos dois controles temporais estáveis e ≥75% das mudanças sustentadas por eles; confiança limitada a 0,82 para essa associação. `persistent-scroll-visual` exige pelo menos três observações visíveis, duas regiões estruturais, faixa de pelo menos duas viewports e 40% da página, com conteúdo gráfico ou alteração observada. Fixed/sticky são descobertos também em estados posteriores. Não se identifica conteúdo 3D, não se lê código WebGL nem se copiam assets.

Controles A/A2/B não provam causalidade absoluta: movimento lento, temporização coincidente, sobreposições, oclusões e recortes continuam alternativas. Um controle só conta como estável se scrollY e dimensões também permanecerem estáveis. Canvas fora das regiões amostradas, dentro de iframe/shadow DOM ou acima do limite pode não ser observado. Mobile observa estrutura, sem repetir comparação visual de canvas. Cobertura geométrica de 100% não garante carregamento de todos os assets, observação de cada instante nem descoberta de estados que exigem interação.

`VisionAnalyzer` aceita adicionalmente segmentos, estados visuais e cobertura, além de desktop/mobile, RAW e DNA determinístico. Não há implementação ou chamada de IA externa.

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
- Os candidatos a primary/secondary são pontuados pelo uso em ações; accent exige headings, texto enfatizado ou badges fora de ações, em pelo menos duas regiões. Após a pontuação, secondary fica desconhecido se não houver pelo menos duas ações distintas das que sustentam primary. Primary/secondary podem compartilhar a cor de accent somente com highlights independentes; a sobreposição e as contagens de contextos distintos aparecem explicitamente nas evidências. Ausência de suporte mantém `value: null` e `confidence: 0`.
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
- Radius agrupa valores semanticamente normalizados (`radiusPill`, `radiusCircle` e valores locais recorrentes). Shadow mantém valores exatos (`shadow1`); numeração estável só no documento. Não há clustering perceptual de sombras.
- A identidade global reutiliza a geometria pill/circle, proporção de caixas arredondadas e radius/menor dimensão. Valores convencionais são medidos separadamente: `sharp`, `low-radius`, `moderately-rounded`, `rounded`, `pill-heavy` ou `circle-heavy`, com pelo menos quatro caixas mensuráveis. Valores extremos e percentuais originais permanecem no RAW.
- Referências: `{ token: "spacing.space16", resolved: 16 }`. `token: null` preserva valores locais. Todos os caminhos referenciados existem no documento.
- Famílias usam anatomia, cor perceptual, estilo e dimensões quantizadas em 32 px. Alturas muito diferentes podem separar componentes. IDs ficam no RAW.
- Foreground usa folhas textuais visíveis, headings e labels internos, ponderados por conteúdo e contexto. Texto sobre superfícies internas distintas (como badges) não domina o texto principal. Contraste abaixo de 1,5:1 em fundo local opaco é preterido quando existe texto legível observado; não se inventa uma cor por contraste. A família agrega os foregrounds das instâncias; sem texto observado, `visualStyle.color` é omitido. Transparência, fundos complexos e conteúdo não amostrado limitam a inferência.
- `designSummary.persistentScroll` só aparece para `persistent-scroll-visual` com confidence ≥ 0,7 e evidência de pelo menos três checkpoints em duas regiões. Descreve persistência observada, sem afirmar causalidade do scroll, parallax, 3D ou WebGL.
- Motion normaliza s/ms, agrupa propriedade/duração/easing e separa declarações de opacity/transform/filter observado. Tokens `duration200` não impõem velocidade subjetiva.
- Índices evitam buscas desktop/mobile e frames quadráticas. Limites: 32 ancestrais, 240 descendentes/irmãos de contexto, 256 cores por frequência antes do clustering, 32 regiões, 40 famílias/padrões, 12 tokens de estilo. Captura mantém 1.800 elementos/12.000 nós.
- Duas larguras não revelam breakpoints. Correspondência exige ID estável/tag/pai/role e aplica sanidade tipográfica; nós substituídos ou fora da amostra podem não corresponder.

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
