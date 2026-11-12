MeuFinanceiro – versão 1.8.0 (fases 1 a 8, novo visual) – versão para pasta na rede local
Como instalar
Extraia esta pasta MeuFinanceiro num local fixo do computador, por exemplo Documentos\MeuFinanceiro. Ela contém só o programa; seus dados ficam em outra pasta.
Na rede, crie uma pasta só para os dados, por exemplo \\SERVIDOR\Compartilhado\MeuFinanceiro-dados, e confira se você consegue criar e editar arquivos nela.
Recomendado: no Explorador de Arquivos, use Mapear unidade de rede para essa pasta (ou a pasta acima dela), escolha uma letra, como Z:, e marque Reconectar ao entrar.
Abra o index.html no Google Chrome ou no Microsoft Edge e escolha a pasta da rede.
Como funciona com a rede
Rede fora do ar durante o uso: o indicador no topo mostra "Não salvo: pasta sem resposta". As alterações ficam guardadas na página e são gravadas sozinhas assim que a pasta voltar (nova tentativa a cada 30 segundos), ou quando você clicar no indicador. Não feche a página enquanto esse aviso estiver aparecendo; o navegador avisa se você tentar.
Pasta inacessível ao abrir: aparece uma orientação para conferir a rede e o botão "Tentar de novo". Nenhum arquivo é alterado.
Outro computador usando os dados: o arquivo sessao.json funciona como trava. Se outro computador estiver com o MeuFinanceiro aberto, aparece um aviso com as opções "Tentar de novo" e "Abrir mesmo assim". A trava expira sozinha 3 minutos depois que o outro computador para de usar.
O Chrome pode criar arquivos temporários terminados em .crswap durante uma gravação. Eles somem ao final; se sobrar algum depois de uma queda de rede, pode apagar.
Atenção ao backup
A pasta da rede não tem cópia automática na nuvem como o Google Drive teria. Confirme se o servidor faz backup da pasta. O MeuFinanceiro faz cópias automáticas dentro da própria pasta de dados (subpasta backups), o que protege contra erros e alterações indevidas, mas não contra a perda da pasta inteira. Por isso, de vez em quando use Configurações > Exportar backup (arquivo) e guarde o arquivo em outro lugar (pen drive, disco externo).

Como testar a Fase 1
Primeira execução: clique em "Escolher pasta de dados", selecione a pasta da rede e permita a edição. Os nove arquivos .json e o sessao.json devem aparecer na pasta, e Configurações > Pasta de dados mostra a lista.
Gravação: em Configurações > Pasta de dados, clique em "Testar gravação" e abra o config.json para ver a data gravada.
Reabertura: feche e abra o index.html de novo. Deve bastar um clique em "Continuar com esta pasta".
Queda de rede (opcional): com a aplicação aberta, desconecte o cabo ou o Wi-Fi, clique em "Testar gravação", reconecte e aguarde até 30 segundos.
Duas abas: abra o index.html em outra aba; ela deve ficar bloqueada com um aviso.
Testes automáticos: abra o testes.html; todos os testes devem passar.
Tudo funciona sem internet: fontes e ícones estão em lib/fontes.

Como testar a Fase 2 (cadastros básicos, versão 1.1.0)
Contas: em Contas, cadastre uma conta com saldo inicial. O saldo atual aparece na tabela e no total do topo. Teste editar, inativar/reativar e excluir. Uma conta com lançamentos (por exemplo, com uma transferência) não pode ser excluída, só inativada. Inativar só tira a conta dos formulários: se ainda houver dinheiro nela, ele continua nos totais (saldo em contas e patrimônio).
Transferências: cadastre duas contas e use Nova transferência. O valor sai de uma conta e entra na outra; o saldo total não muda. A lista mostra as transferências do mês escolhido no cabeçalho.
Categorias: em Configurações, crie, edite e exclua categorias de receita e de despesa. Uma categoria em uso não é excluída direto: o programa pede para escolher outra categoria que receba os registros.
Testes automáticos: abra o testes.html; agora ele também confere saldos, contas, transferências e categorias.
Como testar a Fase 3 (entradas e saídas, versão 1.2.0)
Registrar: em Saídas (ou Entradas), preencha o formulário do topo e salve. Precisa haver ao menos uma conta ativa e uma categoria do tipo certo.
Situação: Pendente é só previsão e não mexe no saldo. Pago (ou Recebido) exige a data efetiva e passa a contar no saldo da conta, na tela Contas.
Na tabela: use o ícone de check para marcar como pago/recebido (o programa pede a data), o de seta para voltar a pendente, o lápis para editar (o formulário do topo é preenchido) e a lixeira para excluir (com confirmação).
Filtros e totais: o período usa a data de competência e acompanha o mês do cabeçalho; também dá para filtrar por datas, categoria, conta e situação. Os totais de pago/recebido e pendente valem para o que está filtrado.
Ainda não existe: recorrência (fase 4). Compras no cartão ficam na tela Cartões (fase 5).
Como testar a Fase 4 (recorrências, versão 1.3.0)
Criar: em Entradas ou Saídas, marque Repetir este lançamento, escolha a repetição (todo mês, toda semana, todo ano ou a cada N dias) e, se quiser, uma data final. O lançamento que você digitou é a primeira ocorrência (com a situação que você escolheu); as próximas são geradas como pendentes até o fim do mês seguinte.
Ao abrir o programa: as ocorrências que faltam são geradas sozinhas, sem duplicar. Uma ocorrência que você apagou não volta. Um aviso informa quantas foram geradas.
Editar uma ocorrência: altera só ela. Ela fica marcada como editada e não muda mais quando o modelo mudar.
Editar o modelo: em Configurações > Recorrências. Vale para as ocorrências futuras; a caixa marcada por padrão também atualiza as pendentes já geradas de hoje em diante. Ocorrências pagas, do passado ou editadas à mão não mudam.
Pausar e retomar: ao retomar, o que ficou no passado durante a pausa não é gerado.
Excluir: os lançamentos já gerados continuam, sem vínculo; a caixa marcada por padrão apaga também as pendentes de hoje em diante.
Limites: a periodicidade e a data inicial não mudam depois de criadas (para mudar o ritmo, defina uma data final e crie outra recorrência). Se a data de início for tão antiga que geraria mais de 120 lançamentos de uma vez, o programa pede uma data mais próxima. Se a conta de uma recorrência for inativada, nada é gerado e o programa avisa.
Mês curto: uma recorrência no dia 31 cai no último dia dos meses menores e volta ao dia 31 depois.
Como testar a Fase 5 (cartões, versão 1.4.0)
Cartão: em Cartões, use "Cadastrar Nubank" ou "Cadastrar Mercado Pago" (o nome já vem preenchido) ou "Outro cartão". Informe limite, dia de fechamento, dia de vencimento e para qual fatura vão as compras do dia do fechamento (padrão: fatura seguinte). Cada cartão tem uma aba.
Compra parcelada: preencha "Nova compra" e clique em Revisar parcelas. A prévia mostra cada parcela, a fatura em que cai e as datas de fechamento e vencimento. Só depois de confirmar a compra é gravada. A diferença de centavos da divisão fica na primeira parcela.
Qual fatura: compras até o dia de fechamento entram na fatura que fecha no mês; depois dele, na seguinte. O "mês da fatura" é o mês do vencimento. Dia que não existe no mês (31 em fevereiro) vira o último dia.
Limite: utilizado = soma dos saldos de todas as faturas, inclusive as futuras (compras parceladas já comprometem o limite). A tela também separa "a pagar" (faturas até a atual) de "parcelas futuras".
Fatura: selecione uma na lista para ver parcelas, ajustes, encargos e pagamentos. Dá para registrar ajuste (valor negativo é crédito), encargo (juros, multa ou outros, na categoria "Encargos de cartão") e mover uma parcela para outra fatura. Com pagamento registrado, a fatura não aceita mais ajuste nem parcela movida; desfaça o pagamento se precisar.
Pagar: escolha a conta, o valor (integral ou parcial) e a data. O dinheiro sai da conta, mas o pagamento não é despesa: a despesa é cada parcela, no mês da sua fatura. Pagamento parcial deixa a fatura "paga parcialmente".
Estorno e cancelamento: Cancelar só vale se nenhuma parcela já foi cobrada. Estorno total cancela as parcelas de faturas ainda abertas e devolve, como crédito na fatura escolhida, o que já foi cobrado. Estorno parcial lança um crédito e não muda as parcelas.
Categorias protegidas: "Encargos de cartão" e "Rendimentos de investimentos" são usadas pelo programa; só a cor delas pode mudar, e não podem ser excluídas.
Ao mudar os dias do cartão: vale para compras novas; faturas ainda sem pagamento recebem as novas datas.
Ainda não existe: o resultado do mês e o patrimônio (dashboard, fase 7) ainda não consideram as parcelas.
Como testar a Fase 6 (investimentos, versão 1.5.0)
Cadastro: em Investimentos, clique em "Novo investimento": nome, classe (renda fixa; ações, ETFs e BDRs; FIIs; criptomoedas; previdência, fundos e outros), instituição e quantidade (opcional, pode ser fracionada).
Movimentações: selecione o investimento e use os botões:
Aporte: o dinheiro sai da conta escolhida. Não é despesa. Inclua no valor os custos da compra.
Resgate: o dinheiro volta para a conta. Não é receita. Informe o valor líquido (IR retido já descontado).
Rendimento: entra na conta como receita, na categoria "Rendimentos de investimentos", e também na rentabilidade. Ele aparece em Entradas com um cadeado: só se altera pela tela Investimentos.
Taxa: só para taxas cobradas à parte na conta (custódia, por exemplo). Reduz saldo e rentabilidade, mas não é despesa. Taxas embutidas na cota já aparecem no valor atual e não se registram. Cada movimentação grava o lançamento na conta e a movimentação no investimento juntos; excluir uma desfaz as duas coisas.
Valor atual: use "Atualizar valor" com a data. Cada atualização fica no histórico (informar a mesma data corrige o valor daquele dia). Sem nenhuma atualização, o valor atual é estimado pelo que foi aportado, sem ganho nenhum. Aportes e resgates feitos depois da última atualização ajustam o valor automaticamente (aporte soma, resgate subtrai), para o patrimônio não cair nem dobrar até a próxima atualização; a tela avisa quando isso acontece.
Rentabilidade: valor atual + resgates + rendimentos recebidos − aportes − taxas. Em %, é essa rentabilidade dividida pelo total aportado. Aparece por investimento e para a carteira toda, com a distribuição por classe.
Encerrar: só com valor atual zero (registre o resgate e atualize o valor para R$ 0,00). Investimento com movimentações não pode ser excluído, só encerrado.
Como testar a Fase 7 (dashboard, versão 1.6.0)
Período: por padrão, o mês escolhido no cabeçalho. "Personalizado" abre as datas De e Até; a comparação passa a ser com o período imediatamente anterior, do mesmo tamanho.
Cards: patrimônio líquido (o destaque), saldo em contas, total investido, receitas, despesas, resultado e faturas em aberto. Cada um mostra a variação contra o mês anterior, em valor e em percentual (seta, sinal e texto; a cor só reforça).
Resultado x caixa: receitas e despesas usam a data de competência; o que está pendente aparece como "previsto" e nunca entra no realizado. As despesas incluem cada parcela de cartão no mês da fatura, os encargos e os ajustes da fatura. O painel "Caixa do período" mostra o que de fato entrou e saiu das contas, por data de pagamento; nele, pagamento de fatura, aporte e taxa de investimento são saídas, mas não são despesa de consumo.
Patrimônio líquido = saldos das contas + valor atual dos investimentos − faturas a pagar − parcelas futuras. A composição aparece em um painel, comparada com o fim do período anterior.
Filtros: conta, cartão e categoria. Categoria vale para receitas e despesas. Conta e cartão são alternativas: com os dois, entram os lançamentos da conta e as despesas do cartão. Conta limita o saldo; cartão limita as faturas em aberto. Investimentos e patrimônio mostram sempre o total.
Gráficos (desenhados pelo próprio programa, sem bibliotecas): receitas x despesas dos últimos 12 meses, evolução do patrimônio, despesas por categoria e distribuição dos investimentos por classe. Passe o mouse para ver os valores; abaixo de cada gráfico há "Ver como tabela".
Histórico: para comparar com meses passados, saldos, investimentos e faturas são reconstruídos a partir dos registros de hoje. Compras contam desde a data da compra, ajustes desde o fechamento da fatura e encargos desde o vencimento.
Pasta de dados: o painel com a lista de arquivos e o "Testar gravação", que ficava no dashboard provisório, foi para Configurações.
Como testar a Fase 8 (backup, restauração, Excel e impressão, versão 1.7.0)
Tudo isso fica em Configurações (e a impressão também no botão de impressora do topo).

Backup automático: depois das alterações gravadas, o programa espera alguns segundos e copia todos os arquivos de dados para backups/AAAA-MM-DD_HH-MM dentro da pasta de dados. Para não encher a pasta (e o Google Drive) de cópias, existe um intervalo mínimo entre cópias automáticas (padrão: 10 minutos, configurável de 1 a 240): o que mudar nesse intervalo entra junto na cópia seguinte, e uma cópia idêntica à anterior nem é gravada. Se você fechar ou esconder a aba com alteração ainda sem cópia, a cópia é feita na hora (desde que a última tenha mais de 2 minutos). Ao abrir o programa, garante uma cópia do dia. Os dados em si são gravados a cada alteração; o intervalo só vale para as cópias de backup. Ficam as N cópias mais recentes (padrão 30, configurável na tela) e, além delas, a última de cada um dos últimos 30 dias. Cópias "antes de restaurar" nunca são apagadas sozinhas. Se o backup falhar, o programa avisa, mas os dados continuam sendo gravados normalmente.
Fazer cópia agora: cria uma cópia na pasta backups na hora, mesmo que nada tenha mudado.
Exportar backup (arquivo): gera um arquivo único MeuFinanceiro-backup-....json com todos os dados e abre a janela "Salvar como" para você escolher onde guardar. Escolha um local fora da pasta de dados e do Google Drive.
Restaurar: pela lista de cópias da pasta backups ou por "Restaurar de um arquivo…". O programa confere o backup inteiro, mostra quantos registros ele tem, pede confirmação, guarda uma cópia de segurança do estado atual (..._antes-de-restaurar) e só então troca os dados. Se a cópia de segurança não puder ser gravada, nada é alterado.
Exportar para Excel: gera MeuFinanceiro-AAAA-MM-DD.xlsx com as abas Lançamentos, Compras no cartão, Parcelas do cartão, Investimentos, Movimentações investimentos e Valores atuais. Valores em reais, datas como datas, cabeçalho em negrito e primeira linha congelada. A planilha é gerada pelo próprio programa, sem biblioteca externa, e vai comprimida (cerca de 4 a 10 vezes menor: com 7 mil lançamentos, uns 1 a 2 MB em vez de 8 MB).
Imprimir / Salvar como PDF: use o botão de impressora no topo (ou Ctrl+P). Menus, botões e janelas não saem na página, as cores ficam claras mesmo no tema escuro, e painéis e linhas de tabela evitam ser cortados no meio. Na janela de impressão, escolha "Salvar como PDF" no destino.
Para conferir a restauração com segurança: faça uma alteração qualquer (por exemplo, uma conta de teste), restaure a cópia anterior e confirme que a alteração sumiu; depois restaure a cópia "antes de restaurar" para trazê-la de volta.
Os saldos nunca são gravados nos arquivos: são recalculados a partir do saldo inicial e dos lançamentos pagos ou recebidos.

Revisão final (versão 1.7.0)
Antes de fechar a versão 1, o projeto passou por uma revisão completa: leitura independente do código, teste de estresse com milhares de operações aleatórias (verificando a integridade dos dados depois de cada uma), medição de desempenho com 10 anos de dados e teste ponta a ponta do programa real num navegador. Principais ajustes que vieram dela:

Arquivo de dados vazio (0 bytes): se, numa pasta já em uso, algum arquivo aparecer vazio (por exemplo, por falha de um programa de sincronização), o programa não o regrava: mostra o erro e orienta a copiar o arquivo de uma cópia da pasta backups. Depois é só clicar em "Tentar de novo".
Restaurações seguidas: cada restauração guarda a sua própria cópia de segurança, mesmo no mesmo minuto.
Formulários de Entradas e Saídas: o que você digitou não se perde ao marcar uma linha como paga, excluir outra linha ou trocar o mês no cabeçalho. O foco do teclado volta ao campo depois de cada atualização da tela.
Filtros: um filtro que aponta para algo excluído (conta, cartão ou categoria) é desfeito sozinho.
Cartões: estorno parcial não pode mais ser removido depois do estorno total; cartão com ajuste ou encargo lançado não é excluído em silêncio; remover ajuste, encargo ou atualização de valor pede confirmação.
Impressão: os valores dos gráficos saem impressos (a visão em tabela é aberta antes de imprimir).
Desempenho medido (RNF-08, meta: abrir em até 2 s): com 10 anos e 7 mil lançamentos o Dashboard desenha em cerca de 60 ms; com 24 mil lançamentos, cerca de 150 ms.
