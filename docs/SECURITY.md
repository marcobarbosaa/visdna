# Modelo de segurança

## Fronteiras de confiança

Entrada HTTP e documentos remotos são não confiáveis. O Visual DNA é dado, não código. O frontend usa `textContent`, nunca HTML original. Somente valores CSS selecionados entram nas propriedades específicas de amostras, sem avaliação de scripts. URLs de background são removidas durante a coleta. Não há exportação de cookies, texto ou documentos originais.

## SSRF e DNS rebinding

1. O parser WHATWG normaliza representações numéricas alternativas de IPv4.
2. São aceitos apenas HTTP/HTTPS nas portas padrão ou 80/443, sem usuário/senha.
3. `ipaddr.js` classifica endereços; só `unicast` é permitido. IPv4 mapeado em IPv6 é normalizado antes da classificação.
4. Todos os resultados DNS precisam ser públicos; mistura público/privado falha.
5. O transporte Node conecta ao **endereço aprovado**, não ao hostname novamente. O Host e TLS SNI preservam o hostname e os certificados são verificados.
6. Cada requisição interceptada recebe a mesma validação. Não são usados `route.continue()` ou `route.fetch()` para trafegar recursos remotos.
7. O navegador tem proxy local que fecha conexões: caminhos que não passem pelo transporte controlado falham sem conseguir usar o proxy como túnel.
8. WebSockets e service workers são bloqueados; WebRTC recebe política para impedir UDP sem proxy.

Isso não representa uma prova formal de isolamento de todos os subsistemas de um navegador. Uma versão hospedada deve executar o navegador numa rede isolada com egress default-deny, limitar memória/CPU em nível de SO, autenticar usuários e separar arquivos de cada tenant.

## Limites implementados

| Limite                            |                    Valor |
| --------------------------------- | -----------------------: |
| Análises concorrentes             |                        1 |
| Comprimento de URL                |         2.048 caracteres |
| Corpo de solicitação da API       |                    4 KiB |
| DNS por resolução                 |               5 segundos |
| Timeout de inatividade de recurso |              10 segundos |
| Navegação principal               |              25 segundos |
| Captura com navegador             |              60 segundos |
| Prazo máximo do worker            |              75 segundos |
| Recursos por análise              |                      240 |
| Recurso individual                |                    5 MiB |
| Bytes recebidos por análise       |                   30 MiB |
| Respostas de redirect, agregadas  |                       12 |
| Nós inspecionados / coletados     |           12.000 / 1.800 |
| Full screenshot                   |    até 2.400 × 12.000 px |
| Histórico                         | 30 registros, até 7 dias |

Limite de bytes não limita memória descomprimida de imagens ou canvas. O parâmetro V8 de 256 MiB restringe parte do heap JavaScript do renderer, não a memória total. Um atacante ainda pode consumir recursos antes do encerramento. Para exposição pública, limite memória e CPU em infraestrutura própria.

## Isolamento do ciclo de vida

Cada análise usa worker e navegador próprios. Contexto não persistente, sandbox ligado, nenhuma permissão concedida, downloads negados, pop-ups fechados. O processo supervisor aplica deadline independente. No Unix, o worker está num grupo separado; no Windows, o encerramento usa `taskkill /T /F`. Isso permite encerrar os descendentes do worker em timeout. Ao reiniciar, registros incompletos tornam-se erros.

## Limites deliberados

Não há autenticação porque o bind é loopback. Host e Origin são validados, sem CORS liberado, e a API de escrita exige JSON. Isso não autentica outros programas locais da mesma conta. O app não deve ficar atrás de um proxy público sem uma nova camada de segurança.

A detecção de desafios é textual e imperfeita. O app não clica em desafios, não usa stealth, não tenta login e não recupera cookies do usuário. Não há crawling além da página e seus recursos de renderização.

## O que verificar antes de publicar

Revisão independente da política de rede, isolamento de processos e DNS; browser atualizado; teste de redirecionamentos, subrecursos e canais não HTTP; limites de memória nativa; autenticação; quota por usuário; limpeza após falhas; direitos e retenção dos screenshots. Esta lista descreve trabalho futuro, não proteções já implementadas.
