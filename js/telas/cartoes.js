/* Tela Cartões (RF-16 a RF-25): uma aba por cartão, com limite, faturas, compras e parcelas futuras.

   Fluxos
   - Nova compra: formulário -> prévia das parcelas por fatura -> confirmar.
   - Fatura: selecione uma na lista para ver parcelas, ajustes, encargos e pagamentos, e para pagar.
   - Estorno e cancelamento ficam nas ações de cada compra. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  const SITUACAO_FATURA = {
    aberta: ['Aberta', 'etiqueta--info'],
    fechada: ['Fechada', 'etiqueta--alerta'],
    paga_parcial: ['Paga parcialmente', 'etiqueta--alerta'],
    paga: ['Paga', 'etiqueta--sucesso'],
  };

  // Estado da tela (continua ao redesenhar): aba do cartão, fatura aberta no detalhe e filtro.
  let abaId = null;
  let faturaMes = null;
  let mostrarPagas = false;

  /* ---------- Pequenos blocos de HTML ---------- */

  function atributos(dados) {
    return Object.keys(dados || {})
      .map(function (k) {
        return ' data-' + k + '="' + esc(dados[k]) + '"';
      })
      .join('');
  }

  function botao(acao, icone, rotulo, dados, desabilitado) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '"' + atributos(dados) +
      (desabilitado ? ' disabled' : '') + ' title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) +
      '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  }

  function botaoTexto(acao, icone, texto, classe, dados, desabilitado) {
    return (
      '<button type="button" class="botao ' + classe + '" data-acao="' + acao + '"' + atributos(dados) +
      (desabilitado ? ' disabled' : '') + '><span class="icone" aria-hidden="true">' + icone + '</span>' + esc(texto) + '</button>'
    );
  }

  function etiquetaFatura(situacao) {
    const s = SITUACAO_FATURA[situacao] || [situacao, ''];
    return '<span class="etiqueta ' + s[1] + '">' + s[0] + '</span>';
  }

  function moeda(valor, comCor) {
    return '<span class="' + (comCor && valor < 0 ? 'valor-negativo' : '') + '">' + U.formatarMoeda(valor) + '</span>';
  }

  function nomeCategoria(id) {
    const c = App.categorias.obter(id);
    return c ? '<span class="cor-ponto" style="background:' + U.corSegura(c.cor) + '"></span>' + esc(c.nome) : '—';
  }

  /* ---------- Execução de ações ---------- */

  async function executar(acao, mensagemSucesso) {
    try {
      const resultado = await acao();
      if (resultado !== false && mensagemSucesso) App.aviso.sucesso(mensagemSucesso);
    } catch (erro) {
      if (erro instanceof App.ErroValidacao) {
        App.aviso.alerta(erro.message);
      } else {
        console.error(erro);
        App.aviso.erro('Algo deu errado: ' + erro.message);
      }
    }
    App.roteador.renderizar();
  }

  function cartaoAtual() {
    return App.cartoes.obter(abaId);
  }

  /* ---------- Cartão (RF-16) ---------- */

  function abrirCartao(cartao, sugestao) {
    const v = cartao || sugestao || {};
    const modos = Object.keys(App.cartoes.MODOS_FECHAMENTO).map(function (k) {
      return { valor: k, rotulo: App.cartoes.MODOS_FECHAMENTO[k] };
    });
    return App.modal.abrir({
      titulo: cartao ? 'Editar cartão' : 'Novo cartão',
      corpo:
        F.grade(
          F.campo({ nome: 'nome', rotulo: 'Nome do cartão', valor: v.nome, obrigatorio: true, maxlength: 40 }) +
            F.campo({ nome: 'instituicao', rotulo: 'Instituição', valor: v.instituicao, obrigatorio: true, maxlength: 60 }) +
            F.campo({ nome: 'limite', rotulo: 'Limite total (R$)', tipo: 'moeda', valor: v.limite === undefined ? '' : v.limite, obrigatorio: true, inteiro: true }) +
            F.campo({ nome: 'diaFechamento', rotulo: 'Dia de fechamento', tipo: 'numero', valor: v.diaFechamento === undefined ? '' : v.diaFechamento, obrigatorio: true, dica: 'Compras depois desse dia vão para a fatura seguinte.' }) +
            F.campo({ nome: 'diaVencimento', rotulo: 'Dia de vencimento', tipo: 'numero', valor: v.diaVencimento === undefined ? '' : v.diaVencimento, obrigatorio: true }) +
            F.campo({
              nome: 'compraNoDiaFechamento', rotulo: 'Compras feitas no dia do fechamento', tipo: 'select', opcoes: modos,
              valor: v.compraNoDiaFechamento || 'proxima', inteiro: true,
            })
        ) +
        (cartao ? '<p class="texto-secundario">Mudar os dias vale para compras novas. As faturas ainda sem pagamento recebem as novas datas; as parcelas já distribuídas continuam onde estão.</p>' : ''),
      aoSalvar: async function (form) {
        const f = F.valores(form);
        const dados = {
          nome: f.nome,
          instituicao: f.instituicao,
          limite: U.paraCentavos(f.limite),
          diaFechamento: f.diaFechamento,
          diaVencimento: f.diaVencimento,
          compraNoDiaFechamento: f.compraNoDiaFechamento,
        };
        if (dados.limite === null) throw new App.ErroValidacao('Informe o limite total, como 8.000,00.');
        if (cartao) return App.cartoes.editar(cartao.id, dados);
        const gravou = await App.cartoes.criar(dados);
        const lista = App.dados.registros('cartoes');
        abaId = lista[lista.length - 1].id;
        faturaMes = null;
        return gravou;
      },
    });
  }

  /* ---------- Compra (RF-17, RF-18) ---------- */

  function htmlPrevia(dados, previa) {
    const linhas = previa.parcelas.map(function (p) {
      return (
        '<tr><td>' + p.numero + '/' + previa.parcelas.length + '</td><td>' + U.formatarMes(p.mesFatura) + '</td>' +
        '<td>' + U.formatarData(p.dataFechamento) + '</td><td>' + U.formatarData(p.dataVencimento) + '</td>' +
        '<td class="numero">' + U.formatarMoeda(p.valor) + '</td></tr>'
      );
    }).join('');
    const diferenca = previa.parcelas.length > 1 && previa.parcelas[0].valor !== previa.parcelas[1].valor;
    return (
      '<p><strong>' + esc(dados.descricao) + '</strong> · ' + U.formatarMoeda(dados.valorTotal) + ' em ' + previa.parcelas.length +
      (previa.parcelas.length === 1 ? ' parcela (à vista)' : ' parcelas') + ' no cartão <strong>' + esc(previa.cartao.nome) + '</strong>.</p>' +
      '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Parcela</th><th>Fatura</th><th>Fecha em</th><th>Vence em</th><th class="numero">Valor</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>' +
      (diferenca ? '<p class="texto-secundario">A diferença de centavos da divisão fica na primeira parcela.</p>' : '') +
      '<p class="texto-secundario">Ao confirmar, cada parcela entra na fatura indicada e conta como despesa no mês dela.</p>'
    );
  }

  async function enviarCompra(form) {
    const v = F.valores(form);
    const dados = {
      cartaoId: v.cartaoId,
      descricao: v.descricao,
      valorTotal: U.paraCentavos(v.valorTotal),
      parcelas: v.parcelas,
      dataCompra: v.dataCompra,
      categoriaId: v.categoriaId,
      observacao: v.observacao,
    };
    if (dados.valorTotal === null) throw new App.ErroValidacao('Informe o valor total, como 1.200,00.');
    const previa = App.compras.prever(dados); // valida tudo antes de abrir a prévia
    const totalAntes = App.compras.listar().length;
    const salvou = await App.modal.abrir({
      titulo: 'Confirmar compra',
      rotuloSalvar: 'Confirmar compra',
      corpo: htmlPrevia(dados, previa),
      aoSalvar: function () {
        return App.compras.criar(dados);
      },
    });
    if (salvou) App.aviso.sucesso('Compra registrada.');
    // Se a pasta não respondeu, a compra já está na memória (e será gravada quando a pasta voltar):
    // redesenha mesmo assim, para a lista mostrar o que existe e o formulário não ser reenviado por engano.
    if (salvou || App.compras.listar().length !== totalAntes) {
      abaId = dados.cartaoId;
      faturaMes = previa.parcelas[0].mesFatura;
      App.roteador.renderizar();
    }
  }

  function abrirEdicaoDaCompra(compra) {
    const categorias = App.categorias.listar('despesa').map(function (c) {
      return { valor: c.id, rotulo: c.nome };
    });
    return App.modal.abrir({
      titulo: 'Editar compra',
      corpo:
        F.grade(
          F.campo({ nome: 'descricao', rotulo: 'Descrição', valor: compra.descricao, obrigatorio: true, maxlength: 120, inteiro: true }) +
            F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, valor: compra.categoriaId, obrigatorio: true, inteiro: true }) +
            F.campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', valor: compra.observacao, inteiro: true })
        ) +
        '<p class="texto-secundario">Valor, parcelas e data não mudam. Se precisar corrigir, exclua a compra (se ainda não houve pagamento) ou use estorno e cancelamento.</p>',
      aoSalvar: async function (form) {
        const v = F.valores(form);
        return App.compras.editar(compra.id, { descricao: v.descricao, categoriaId: v.categoriaId, observacao: v.observacao });
      },
    });
  }

  // Fatura que recebe o crédito de um estorno: da atual até três meses à frente, sem pagamento.
  function opcoesDeCredito(cartao) {
    const hoje = U.hojeISO();
    const ctx = App.faturas.contexto(hoje);
    const atual = App.calc.cartoes.mesDaFatura(cartao, hoje);
    const opcoes = [];
    for (let i = 0; i < 4; i++) {
      const mes = U.somarMeses(atual, i);
      const fatura = App.faturas.obterPorMes(cartao.id, mes);
      if (fatura && App.faturas.info(fatura, hoje, ctx).temPagamento) continue;
      opcoes.push({ valor: mes, rotulo: U.formatarMes(mes) + (i === 0 ? ' (fatura atual)' : '') });
    }
    return opcoes;
  }

  function abrirEstornoTotal(compra) {
    const cartao = App.cartoes.obter(compra.cartaoId);
    const previa = App.compras.previaDoEstornoTotal(compra, U.hojeISO()); // a regra fica no motor, não aqui
    const credito = previa.credito;
    return App.modal.abrir({
      titulo: 'Estorno total',
      rotuloSalvar: 'Estornar compra',
      perigo: true,
      corpo:
        '<p>Estornar <strong>' + esc(compra.descricao) + '</strong> (' + U.formatarMoeda(compra.valorTotal) + ')?</p>' +
        '<ul class="texto-secundario">' +
        '<li>' + previa.parcelasCanceladas + ' parcela(s) de faturas ainda abertas, somando ' + U.formatarMoeda(previa.valorCancelado) + ', serão canceladas.</li>' +
        '<li>' + (credito > 0
          ? 'O que já foi cobrado (' + U.formatarMoeda(credito) + ') volta como crédito na fatura escolhida abaixo.'
          : credito < 0
            ? 'Os estornos parciais já lançados passam do que foi cobrado; o excesso (' + U.formatarMoeda(-credito) + ') é revertido na fatura escolhida abaixo.'
            : 'Nada foi cobrado ainda, então não há crédito a lançar.') + '</li></ul>' +
        (credito !== 0
          ? F.campo({ nome: 'mesCredito', rotulo: 'Fatura que recebe o crédito', tipo: 'select', opcoes: opcoesDeCredito(cartao), valor: '' })
          : ''),
      aoSalvar: async function (form) {
        return App.compras.estornarTotal(compra.id, { mesCredito: F.valores(form).mesCredito });
      },
    });
  }

  function abrirEstornoParcial(compra) {
    const cartao = App.cartoes.obter(compra.cartaoId);
    const restante = compra.valorTotal - App.compras.totalEstornado(compra);
    return App.modal.abrir({
      titulo: 'Estorno parcial',
      rotuloSalvar: 'Lançar estorno',
      corpo:
        '<p>Compra <strong>' + esc(compra.descricao) + '</strong>. Ainda é possível estornar até ' + U.formatarMoeda(restante) + '.</p>' +
        F.grade(
          F.campo({ nome: 'valor', rotulo: 'Valor estornado (R$)', tipo: 'moeda', obrigatorio: true }) +
            F.campo({ nome: 'mesCredito', rotulo: 'Fatura que recebe o crédito', tipo: 'select', opcoes: opcoesDeCredito(cartao), valor: '' })
        ) +
        '<p class="texto-secundario">As parcelas da compra não mudam; o valor entra como crédito na fatura escolhida.</p>',
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe o valor estornado, como 50,00.');
        return App.compras.estornarParcial(compra.id, { valor: valor, mesCredito: v.mesCredito });
      },
    });
  }

  /* ---------- Fatura (RF-20 a RF-22) ---------- */

  function abrirPagamento(info) {
    const contas = App.contas.listar().filter(function (c) { return c.ativa; });
    if (!contas.length) {
      App.aviso.info('Cadastre uma conta ativa em Contas para pagar a fatura.');
      return Promise.resolve(false);
    }
    const saldos = App.contas.saldos();
    return App.modal.abrir({
      titulo: 'Pagar fatura ' + U.formatarMes(info.fatura.mes),
      rotuloSalvar: 'Registrar pagamento',
      corpo:
        '<p>Saldo da fatura: <strong>' + U.formatarMoeda(info.saldo) + '</strong>. Pagamento parcial deixa a fatura "paga parcialmente" até a quitação.</p>' +
        F.grade(
          F.campo({
            nome: 'contaId', rotulo: 'Conta de origem', tipo: 'select', obrigatorio: true,
            opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome + ' (' + U.formatarMoeda(saldos[c.id]) + ')' }; }),
          }) +
            F.campo({ nome: 'valor', rotulo: 'Valor pago (R$)', tipo: 'moeda', valor: info.saldo, obrigatorio: true }) +
            F.campo({ nome: 'data', rotulo: 'Data do pagamento', tipo: 'data', valor: U.hojeISO(), obrigatorio: true })
        ),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe o valor pago, como 350,00.');
        return App.faturas.pagar(info.fatura.id, { contaId: v.contaId, valor: valor, data: v.data });
      },
    });
  }

  function abrirAjuste(info) {
    return App.modal.abrir({
      titulo: 'Ajuste na fatura ' + U.formatarMes(info.fatura.mes),
      corpo:
        F.grade(
          F.campo({ nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, maxlength: 80, inteiro: true }) +
            F.campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, inteiro: true, dica: 'Use sinal negativo para crédito ou desconto (por exemplo, -50,00).' })
        ),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe um valor válido, como 25,00 ou -50,00.');
        return App.faturas.adicionarAjuste(info.fatura.id, { descricao: v.descricao, valor: valor });
      },
    });
  }

  function abrirEncargo(info) {
    const tipos = Object.keys(App.faturas.TIPOS_ENCARGO).map(function (k) {
      return { valor: k, rotulo: App.faturas.TIPOS_ENCARGO[k] };
    });
    return App.modal.abrir({
      titulo: 'Encargo na fatura ' + U.formatarMes(info.fatura.mes),
      corpo:
        F.grade(
          F.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: tipos, valor: 'juros', obrigatorio: true }) +
            F.campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true }) +
            F.campo({ nome: 'descricao', rotulo: 'Descrição (opcional)', maxlength: 80, inteiro: true })
        ) +
        '<p class="texto-secundario">Juros, multas e encargos são a única despesa nova da fatura e entram na categoria "Encargos de cartão".</p>',
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe o valor do encargo, como 15,90.');
        return App.faturas.adicionarEncargo(info.fatura.id, { tipo: v.tipo, valor: valor, descricao: v.descricao });
      },
    });
  }

  function abrirMoverParcela(compra, parcela) {
    return App.modal.abrir({
      titulo: 'Mover parcela ' + parcela.numero + '/' + compra.parcelas.length,
      rotuloSalvar: 'Mover parcela',
      corpo:
        '<p><strong>' + esc(compra.descricao) + '</strong>, hoje na fatura de ' + U.formatarMes(parcela.mesFatura) +
        '. Use quando a loja processa a compra com atraso e a parcela cai em outra fatura.</p>' +
        F.campo({ nome: 'mes', rotulo: 'Fatura de destino', tipo: 'mes', valor: U.somarMeses(parcela.mesFatura, 1), obrigatorio: true }),
      aoSalvar: async function (form) {
        return App.compras.moverParcela(compra.id, parcela.numero, F.valores(form).mes);
      },
    });
  }

  /* ---------- Blocos da tela ---------- */

  function htmlAbas(cartoes) {
    return (
      '<div class="abas" role="tablist" aria-label="Cartões">' +
      cartoes.map(function (c) {
        return (
          '<button type="button" role="tab" class="aba ' + (c.ativo ? '' : 'aba--inativa') + '" aria-selected="' + (c.id === abaId) +
          '" data-acao="aba" data-id="' + esc(c.id) + '"><span class="icone" aria-hidden="true">credit_card</span>' +
          esc(c.nome) + (c.ativo ? '' : ' (inativo)') + '</button>'
        );
      }).join('') +
      '<button type="button" class="aba" data-acao="novo-cartao"><span class="icone" aria-hidden="true">add</span>Novo cartão</button></div>'
    );
  }

  function htmlResumo(cartao, resumo) {
    const pct = cartao.limite > 0 ? Math.min(100, Math.round((resumo.utilizado / cartao.limite) * 100)) : 0;
    const classeBarra = resumo.disponivel < 0 ? 'barra-limite__uso--erro' : pct >= 80 ? 'barra-limite__uso--alerta' : '';
    const fa = resumo.faturaAtual;
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>' + esc(cartao.nome) + '</h2>' +
      '<p class="texto-secundario">' + esc(cartao.instituicao) + ' · fecha dia ' + cartao.diaFechamento + ' · vence dia ' + cartao.diaVencimento +
      (cartao.compraNoDiaFechamento === 'atual' ? ' · compras do dia do fechamento entram na fatura que fecha' : '') + '</p></div>' +
      '<div class="painel__acoes">' +
      botaoTexto('editar-cartao', 'edit', 'Editar', 'botao--secundario botao--pequeno') +
      botaoTexto('alternar-cartao', cartao.ativo ? 'block' : 'check_circle', cartao.ativo ? 'Inativar' : 'Reativar', 'botao--fantasma botao--pequeno') +
      botaoTexto('excluir-cartao', 'delete', 'Excluir', 'botao--fantasma botao--pequeno') +
      '</div></div>' +
      '<div class="barra-limite" role="img" aria-label="Limite utilizado: ' + pct + '%"><div class="barra-limite__uso ' + classeBarra + '" style="width:' + pct + '%"></div></div>' +
      '<div class="totais totais--quatro">' +
      '<div class="total-item"><span class="total-item__rotulo">Limite total</span><span class="total-item__valor">' + U.formatarMoeda(cartao.limite) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Limite utilizado</span><span class="total-item__valor valor-pendente">' + U.formatarMoeda(resumo.utilizado) + '</span>' +
      '<span class="texto-fraco">A pagar ' + U.formatarMoeda(resumo.aPagar) + ' · parcelas futuras ' + U.formatarMoeda(resumo.saldoFuturas) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Limite disponível</span><span class="total-item__valor ' + (resumo.disponivel < 0 ? 'valor-negativo' : 'valor-positivo') + '">' + U.formatarMoeda(resumo.disponivel) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Fatura atual (' + U.formatarMes(resumo.mesAtual) + ')</span><span class="total-item__valor">' + U.formatarMoeda(fa ? fa.total : 0) + '</span>' +
      '<span class="texto-fraco">' + (fa ? 'Vence em ' + U.formatarData(fa.fatura.dataVencimento) : 'Ainda sem compras') + '</span></div>' +
      '</div></section>'
    );
  }

  function htmlFormularioCompra(cartao, cartoes) {
    const categorias = App.categorias.listar('despesa').map(function (c) {
      return { valor: c.id, rotulo: c.nome };
    });
    let corpo;
    if (!cartao.ativo) {
      corpo = '<p class="vazio">Este cartão está inativo. Reative-o para registrar compras.</p>';
    } else if (!categorias.length) {
      corpo = '<p class="vazio">Não há categorias de despesa. Cadastre uma em <a href="#configuracoes">Configurações</a>.</p>';
    } else {
      corpo =
        '<form data-form-compra novalidate>' +
        F.grade(
          F.campo({ nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, maxlength: 120, classe: 'campo--dobro' }) +
            F.campo({ nome: 'valorTotal', rotulo: 'Valor total (R$)', tipo: 'moeda', obrigatorio: true }) +
            F.campo({ nome: 'parcelas', rotulo: 'Parcelas', tipo: 'numero', valor: '1', obrigatorio: true, dica: '1 = à vista' }) +
            F.campo({
              nome: 'cartaoId', rotulo: 'Cartão', tipo: 'select', valor: cartao.id, obrigatorio: true,
              opcoes: cartoes.filter(function (c) { return c.ativo; }).map(function (c) { return { valor: c.id, rotulo: c.nome }; }),
            }) +
            F.campo({ nome: 'dataCompra', rotulo: 'Data da compra', tipo: 'data', valor: U.hojeISO(), obrigatorio: true }) +
            F.campo({ nome: 'categoriaId', rotulo: 'Categoria', tipo: 'select', opcoes: categorias, obrigatorio: true, classe: 'campo--dobro' }) +
            F.campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', classe: 'campo--triplo' }),
          true
        ) +
        '<p class="formulario__erro" role="alert" hidden style="margin-top:var(--esp-3)"></p>' +
        '<div class="painel__acoes" style="margin-top:var(--esp-4)">' +
        '<button type="submit" class="botao botao--primario"><span class="icone" aria-hidden="true">fact_check</span>Revisar parcelas</button></div></form>';
    }
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Nova compra</h2>' +
      '<p class="texto-secundario">Cada parcela cai na fatura certa conforme o dia de fechamento. Você confere a prévia antes de confirmar.</p></div></div>' + corpo + '</section>'
    );
  }

  function htmlFaturas(resumo, selecionada) {
    const visiveis = resumo.faturas.filter(function (i) {
      const relevante = i.total !== 0 || i.pago !== 0 || i.fatura.mes === resumo.mesAtual;
      const ehSelecionada = selecionada && i.fatura.mes === selecionada.fatura.mes;
      return ehSelecionada || (relevante && (mostrarPagas || i.situacao !== 'paga'));
    });
    let corpo;
    if (!visiveis.length) {
      corpo = '<p class="vazio">Nenhuma fatura para mostrar.</p>';
    } else {
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Fatura</th><th>Fecha em</th><th>Vence em</th><th class="numero">Total</th><th class="numero">Pago</th><th class="numero">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>' +
        visiveis.map(function (i) {
          const escolhida = selecionada && i.fatura.mes === selecionada.fatura.mes;
          return (
            '<tr class="' + (escolhida ? 'selecionada' : '') + '"><td><strong>' + U.formatarMes(i.fatura.mes) + '</strong>' +
            (i.fatura.mes === resumo.mesAtual ? ' <span class="etiqueta">Atual</span>' : '') + '</td>' +
            '<td>' + U.formatarData(i.fatura.dataFechamento) + '</td><td>' + U.formatarData(i.fatura.dataVencimento) + '</td>' +
            '<td class="numero">' + U.formatarMoeda(i.total) + '</td><td class="numero">' + U.formatarMoeda(i.pago) + '</td>' +
            '<td class="numero">' + moeda(i.saldo, true) + '</td><td>' + etiquetaFatura(i.situacao) + '</td>' +
            '<td class="tabela__acoes">' + botao('ver-fatura', 'visibility', 'Ver detalhes da fatura', { mes: i.fatura.mes }) + '</td></tr>'
          );
        }).join('') + '</tbody></table></div>';
    }
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Faturas</h2>' +
      '<p class="texto-secundario">O mês da fatura é o mês do vencimento. Total = parcelas do mês + ajustes + encargos.</p></div>' +
      F.campo({ nome: 'pagas', rotulo: 'Mostrar faturas pagas', tipo: 'caixa', valor: mostrarPagas }) + '</div>' + corpo + '</section>'
    );
  }

  function htmlDetalhe(cartao, info) {
    if (!info) return '';
    const f = info.fatura;
    const editavel = !info.temPagamento;
    const parcelas = info.itens.length
      ? info.itens.map(function (item) {
          const c = item.compra;
          const p = item.parcela;
          return (
            '<div class="linha-simples"><div class="linha-simples__texto"><strong>' + esc(c.descricao) + '</strong> ' + p.numero + '/' + c.parcelas.length +
            (p.mesFaturaOriginal ? '<br><span class="texto-fraco">Movida da fatura de ' + U.formatarMes(p.mesFaturaOriginal) + '</span>' : '') + '</div>' +
            '<span>' + U.formatarMoeda(p.valor) + '</span>' +
            botao('mover-parcela', 'drive_file_move', editavel ? 'Mover para outra fatura' : 'Fatura com pagamento: não aceita mudanças', { id: c.id, numero: p.numero }, !editavel) + '</div>'
          );
        }).join('')
      : '<p class="texto-fraco">Nenhuma parcela nesta fatura.</p>';
    const ajustes = f.ajustes.length
      ? f.ajustes.map(function (a) {
          return (
            '<div class="linha-simples"><span class="linha-simples__texto">' + esc(a.descricao) + '</span><span>' + moeda(a.valor, true) + '</span>' +
            botao('remover-ajuste', 'close', 'Remover ajuste', { id: a.id }, !editavel || a.tipo === 'estorno_total') + '</div>'
          );
        }).join('')
      : '<p class="texto-fraco">Nenhum ajuste.</p>';
    const encargos = f.encargos.length
      ? f.encargos.map(function (e) {
          return (
            '<div class="linha-simples"><span class="linha-simples__texto">' + esc(App.faturas.TIPOS_ENCARGO[e.tipo] || e.tipo) +
            (e.descricao && e.descricao !== App.faturas.TIPOS_ENCARGO[e.tipo] ? ': ' + esc(e.descricao) : '') + '</span><span>' + U.formatarMoeda(e.valor) + '</span>' +
            botao('remover-encargo', 'close', 'Remover encargo', { id: e.id }, !editavel) + '</div>'
          );
        }).join('')
      : '<p class="texto-fraco">Nenhum encargo.</p>';
    const pagamentos = f.pagamentoIds.length
      ? f.pagamentoIds.map(function (id) {
          const l = App.lancamentos.obter(id);
          if (!l) return '';
          const conta = App.contas.obter(l.contaId);
          return (
            '<div class="linha-simples"><span class="linha-simples__texto">' + U.formatarData(l.dataPagamento) + ' · ' + (conta ? esc(conta.nome) : '—') +
            '</span><span>' + U.formatarMoeda(l.valor) + '</span>' + botao('desfazer-pagamento', 'undo', 'Desfazer pagamento', { id: l.id }) + '</div>'
          );
        }).join('')
      : '<p class="texto-fraco">Nenhum pagamento.</p>';

    return (
      '<section class="painel" data-detalhe><div class="painel__topo"><div><h2>Fatura ' + U.formatarMes(f.mes) + ' ' + etiquetaFatura(info.situacao) + '</h2>' +
      '<p class="texto-secundario">Fecha em ' + U.formatarData(f.dataFechamento) + ' · vence em ' + U.formatarData(f.dataVencimento) + '</p></div>' +
      '<div class="painel__acoes">' +
      botaoTexto('novo-ajuste', 'tune', 'Ajuste', 'botao--secundario botao--pequeno', {}, !editavel) +
      botaoTexto('novo-encargo', 'percent', 'Encargo', 'botao--secundario botao--pequeno', {}, info.situacao === 'paga') +
      botaoTexto('pagar-fatura', 'payments', 'Pagar fatura', 'botao--primario botao--pequeno', {}, info.saldo <= 0) +
      '</div></div>' +
      '<div class="totais totais--quatro" style="margin-bottom:0">' +
      '<div class="total-item"><span class="total-item__rotulo">Parcelas</span><span class="total-item__valor">' + U.formatarMoeda(info.parcelas) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Ajustes e encargos</span><span class="total-item__valor">' + U.formatarMoeda(info.ajustes + info.encargos) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Total da fatura</span><span class="total-item__valor">' + U.formatarMoeda(info.total) + '</span></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Saldo a pagar</span><span class="total-item__valor ' + (info.saldo > 0 ? 'valor-pendente' : 'valor-positivo') + '">' + U.formatarMoeda(info.saldo) + '</span>' +
      '<span class="texto-fraco">Pago: ' + U.formatarMoeda(info.pago) + '</span></div></div>' +
      (info.temPagamento ? '<p class="nota-info" style="margin-top:var(--esp-4);margin-bottom:0">Esta fatura já tem pagamento: não aceita mais ajustes nem parcelas movidas. Desfaça o pagamento se precisar alterá-la.</p>' : '') +
      '<div class="detalhe-fatura">' +
      '<div class="detalhe-fatura__bloco--cheio"><div class="subtitulo">Parcelas da fatura</div>' + parcelas + '</div>' +
      '<div><div class="subtitulo">Ajustes</div>' + ajustes + '</div>' +
      '<div><div class="subtitulo">Encargos (juros e multas)</div>' + encargos + '</div>' +
      '<div class="detalhe-fatura__bloco--cheio"><div class="subtitulo">Pagamentos</div>' + pagamentos + '</div>' +
      '</div></section>'
    );
  }

  function htmlCompras(cartao) {
    const lista = App.compras.listar(cartao.id);
    let corpo;
    if (!lista.length) {
      corpo = '<p class="vazio">Nenhuma compra neste cartão ainda.</p>';
    } else {
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Parcelas</th><th class="numero">Valor total</th><th>Situação</th><th></th></tr></thead><tbody>' +
        lista.map(function (c) {
          const ativa = c.situacao === 'ativa';
          const n = c.parcelas.length;
          const estornado = App.compras.totalEstornado(c);
          return (
            '<tr class="' + (ativa ? '' : 'inativa') + '"><td>' + U.formatarData(c.dataCompra) + '</td>' +
            '<td class="descricao" title="' + esc(c.observacao || c.descricao) + '"><strong>' + esc(c.descricao) + '</strong></td>' +
            '<td>' + nomeCategoria(c.categoriaId) + '</td>' +
            '<td>' + (n === 1 ? 'À vista' : n + '× · 1ª em ' + U.formatarMes(c.parcelas[0].mesFaturaOriginal || c.parcelas[0].mesFatura)) + '</td>' +
            '<td class="numero">' + U.formatarMoeda(c.valorTotal) + (estornado ? '<br><span class="texto-fraco">estornado ' + U.formatarMoeda(estornado) + '</span>' : '') + '</td>' +
            '<td>' + (ativa ? '<span class="etiqueta etiqueta--sucesso">Ativa</span>' : '<span class="etiqueta">' + (c.situacao === 'estornada' ? 'Estornada' : 'Cancelada') + '</span>') + '</td>' +
            '<td class="tabela__acoes">' +
            botao('editar-compra', 'edit', 'Editar descrição e categoria', { id: c.id }) +
            (ativa ? botao('estorno-parcial', 'remove_circle', 'Estorno parcial', { id: c.id }) + botao('estorno-total', 'assignment_return', 'Estorno total', { id: c.id }) + botao('cancelar-compra', 'cancel', 'Cancelar compra', { id: c.id }) : '') +
            (c.estornos.length ? '' : botao('excluir-compra', 'delete', 'Excluir compra', { id: c.id })) +
            '</td></tr>'
          );
        }).join('') + '</tbody></table></div>';
    }
    return '<section class="painel"><div class="painel__topo"><div><h2>Compras</h2><p class="texto-secundario">Cada compra é registrada uma vez; as parcelas aparecem nas faturas.</p></div></div>' + corpo + '</section>';
  }

  function htmlParcelasFuturas(resumo) {
    let corpo;
    if (!resumo.parcelasFuturas.length) {
      corpo = '<p class="vazio">Nenhuma parcela futura.</p>';
    } else {
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Fatura</th><th>Compra</th><th>Parcela</th><th class="numero">Valor</th></tr></thead><tbody>' +
        resumo.parcelasFuturas.map(function (p) {
          return (
            '<tr><td>' + U.formatarMes(p.mes) + '</td><td>' + esc(p.compra.descricao) + '</td><td>' + p.parcela.numero + '/' + p.compra.parcelas.length +
            '</td><td class="numero">' + U.formatarMoeda(p.parcela.valor) + '</td></tr>'
          );
        }).join('') + '</tbody></table></div>';
    }
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Parcelas futuras</h2>' +
      '<p class="texto-secundario">Parcelas de faturas depois da atual. Já são uma obrigação, mesmo antes de a fatura fechar.</p></div>' +
      '<div class="total-item"><span class="total-item__rotulo">Total comprometido</span><span class="total-item__valor valor-pendente">' + U.formatarMoeda(resumo.totalComprometido) + '</span></div></div>' + corpo + '</section>'
    );
  }

  function htmlSemCartoes() {
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Cartões de crédito</h2>' +
      '<p class="texto-secundario">Cadastre seus cartões para registrar compras parceladas, acompanhar faturas e o limite disponível.</p></div></div>' +
      '<p class="vazio">Nenhum cartão cadastrado ainda.</p>' +
      '<div class="painel__acoes" style="justify-content:center">' +
      botaoTexto('cartao-inicial', 'credit_card', 'Cadastrar Nubank', 'botao--secundario', { nome: 'Nubank' }) +
      botaoTexto('cartao-inicial', 'credit_card', 'Cadastrar Mercado Pago', 'botao--secundario', { nome: 'Mercado Pago' }) +
      botaoTexto('novo-cartao', 'add', 'Outro cartão', 'botao--primario') + '</div></section>'
    );
  }

  /* ---------- Ações ---------- */

  const ACOES = {
    aba: function (alvo) {
      abaId = alvo.id;
      faturaMes = null;
    },
    'novo-cartao': function () {
      return executar(function () { return abrirCartao(null); }, 'Cartão cadastrado.');
    },
    'cartao-inicial': function (alvo) {
      return executar(function () { return abrirCartao(null, { nome: alvo.nome, instituicao: alvo.nome }); }, 'Cartão cadastrado.');
    },
    'editar-cartao': function () {
      return executar(function () { return abrirCartao(cartaoAtual()); }, 'Cartão atualizado.');
    },
    'alternar-cartao': function () {
      const c = cartaoAtual();
      return executar(function () { return App.cartoes.definirAtivo(c.id, !c.ativo); }, c.ativo ? 'Cartão inativado.' : 'Cartão reativado.');
    },
    'excluir-cartao': function () {
      const c = cartaoAtual();
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Excluir cartão',
          mensagem: 'Excluir o cartão "' + c.nome + '"? Isso não pode ser desfeito.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return false;
        const gravou = await App.cartoes.excluir(c.id);
        abaId = null;
        return gravou;
      }, 'Cartão excluído.');
    },
    'ver-fatura': function (alvo) {
      faturaMes = alvo.mes;
    },
    'pagar-fatura': function () {
      return executar(function () { return abrirPagamento(infoSelecionada()); }, 'Pagamento registrado.');
    },
    'novo-ajuste': function () {
      return executar(function () { return abrirAjuste(infoSelecionada()); }, 'Ajuste registrado.');
    },
    'novo-encargo': function () {
      return executar(function () { return abrirEncargo(infoSelecionada()); }, 'Encargo registrado.');
    },
    'remover-ajuste': function (alvo) {
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Remover ajuste', mensagem: 'Remover este ajuste da fatura? O total da fatura é recalculado.', rotuloConfirmar: 'Remover', perigo: true,
        });
        if (!ok) return false;
        return App.faturas.removerAjuste(infoSelecionada().fatura.id, alvo.id);
      }, 'Ajuste removido.');
    },
    'remover-encargo': function (alvo) {
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Remover encargo', mensagem: 'Remover este encargo da fatura? O total da fatura é recalculado.', rotuloConfirmar: 'Remover', perigo: true,
        });
        if (!ok) return false;
        return App.faturas.removerEncargo(infoSelecionada().fatura.id, alvo.id);
      }, 'Encargo removido.');
    },
    'desfazer-pagamento': function (alvo) {
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Desfazer pagamento',
          mensagem: 'Desfazer este pagamento? O valor volta para a conta e a fatura volta a ter saldo a pagar.',
          rotuloConfirmar: 'Desfazer pagamento',
          perigo: true,
        });
        if (!ok) return false;
        return App.faturas.desfazerPagamento(infoSelecionada().fatura.id, alvo.id);
      }, 'Pagamento desfeito.');
    },
    'mover-parcela': function (alvo) {
      const compra = App.compras.obter(alvo.id);
      const parcela = compra.parcelas.find(function (p) { return p.numero === Number(alvo.numero); });
      return executar(function () { return abrirMoverParcela(compra, parcela); }, 'Parcela movida.');
    },
    'editar-compra': function (alvo) {
      return executar(function () { return abrirEdicaoDaCompra(App.compras.obter(alvo.id)); }, 'Compra atualizada.');
    },
    'estorno-parcial': function (alvo) {
      return executar(function () { return abrirEstornoParcial(App.compras.obter(alvo.id)); }, 'Estorno lançado.');
    },
    'estorno-total': function (alvo) {
      return executar(function () { return abrirEstornoTotal(App.compras.obter(alvo.id)); }, 'Compra estornada.');
    },
    'cancelar-compra': function (alvo) {
      const compra = App.compras.obter(alvo.id);
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Cancelar compra',
          mensagem: 'Cancelar "' + compra.descricao + '"? As parcelas deixam de contar nas faturas. Só vale se nada foi cobrado ainda.',
          rotuloConfirmar: 'Cancelar compra',
          perigo: true,
        });
        if (!ok) return false;
        return App.compras.cancelar(compra.id);
      }, 'Compra cancelada.');
    },
    'excluir-compra': function (alvo) {
      const compra = App.compras.obter(alvo.id);
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Excluir compra',
          mensagem: 'Excluir "' + compra.descricao + '" de ' + U.formatarMoeda(compra.valorTotal) + '? As parcelas saem das faturas. Isso não pode ser desfeito.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return false;
        return App.compras.excluir(compra.id);
      }, 'Compra excluída.');
    },
  };

  // Aplicado no desenho: guarda a fatura mostrada para as ações do detalhe.
  let infoDoDetalhe = null;
  function infoSelecionada() {
    return infoDoDetalhe;
  }

  /* ---------- Tela ---------- */

  function render(elemento) {
    const cartoes = App.cartoes.listar();
    if (!cartoes.length) {
      elemento.innerHTML = '<div data-tela="cartoes">' + htmlSemCartoes() + '</div>';
    } else {
      if (!abaId || !App.cartoes.obter(abaId)) {
        abaId = (cartoes.find(function (c) { return c.ativo; }) || cartoes[0]).id;
        faturaMes = null;
      }
      const cartao = cartaoAtual();
      const resumo = App.faturas.resumoDoCartao(cartao);
      let selecionada = resumo.faturas.find(function (i) { return i.fatura.mes === faturaMes; });
      if (!selecionada) selecionada = resumo.faturaAtual || resumo.faturas[0] || null;
      faturaMes = selecionada ? selecionada.fatura.mes : null;
      infoDoDetalhe = selecionada;

      elemento.innerHTML =
        '<div data-tela="cartoes">' + htmlAbas(cartoes) + htmlResumo(cartao, resumo) + htmlFormularioCompra(cartao, cartoes) +
        htmlFaturas(resumo, selecionada) + htmlDetalhe(cartao, selecionada) + htmlCompras(cartao) + htmlParcelasFuturas(resumo) + '</div>';
    }

    const raiz = elemento.firstElementChild;

    // A raiz é recriada a cada desenho, então estes ouvintes não se acumulam.
    raiz.addEventListener('click', async function (evento) {
      const botaoAlvo = evento.target.closest('[data-acao]');
      if (!botaoAlvo || botaoAlvo.disabled) return;
      const tratar = ACOES[botaoAlvo.dataset.acao];
      if (!tratar) return;
      const dados = Object.assign({}, botaoAlvo.dataset);
      const rolar = botaoAlvo.dataset.acao === 'ver-fatura';
      const resultado = tratar(dados);
      if (resultado && typeof resultado.then === 'function') {
        await resultado;
      } else {
        App.roteador.renderizar();
        if (rolar) {
          const detalhe = document.querySelector('[data-detalhe]');
          if (detalhe) detalhe.scrollIntoView({ block: 'nearest' });
        }
      }
    });

    raiz.addEventListener('change', function (evento) {
      if (evento.target.name === 'pagas') {
        mostrarPagas = evento.target.checked;
        App.roteador.renderizar();
      }
    });

    const form = raiz.querySelector('[data-form-compra]');
    if (form) {
      const erro = form.querySelector('.formulario__erro');
      form.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        erro.hidden = true;
        try {
          await enviarCompra(form);
        } catch (e) {
          if (e instanceof App.ErroValidacao) {
            erro.textContent = e.message;
          } else {
            console.error(e);
            erro.textContent = 'Algo deu errado: ' + e.message;
          }
          erro.hidden = false;
        }
      });
    }
  }

  App.roteador.registrar('cartoes', { titulo: 'Cartões', icone: 'credit_card', menu: true, ordem: 4, render: render });
})();
