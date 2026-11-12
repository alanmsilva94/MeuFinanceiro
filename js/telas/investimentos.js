/* Tela Investimentos (RF-26 a RF-31): carteira, lista de ativos e detalhe com movimentações
   e histórico de valores.

   Aportes, resgates, rendimentos e taxas mexem na conta escolhida e no investimento ao mesmo
   tempo. O valor atual é informado manualmente e cada atualização guarda a sua data. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  // Estado da tela (continua ao redesenhar).
  let selecionadoId = null;
  let mostrarEncerrados = false;

  const ETIQUETA_TIPO = {
    aporte: ['Aporte', 'etiqueta--info'],
    resgate: ['Resgate', 'etiqueta--alerta'],
    rendimento: ['Rendimento', 'etiqueta--sucesso'],
    taxa: ['Taxa', 'etiqueta--erro'],
  };

  // Texto de cada movimentação no formulário.
  const TEXTOS = {
    aporte: {
      titulo: 'Novo aporte', conta: 'Conta de origem (de onde sai o dinheiro)', valor: 'Valor investido (R$)',
      dica: 'Inclua no valor os custos da compra, como corretagem e emolumentos. Aporte não é despesa.',
    },
    resgate: {
      titulo: 'Novo resgate', conta: 'Conta de destino (para onde vai o dinheiro)', valor: 'Valor líquido recebido (R$)',
      dica: 'Informe o valor líquido, já descontado o IR retido. Resgate não é receita.',
    },
    rendimento: {
      titulo: 'Novo rendimento', conta: 'Conta que recebeu', valor: 'Valor recebido (R$)',
      dica: 'Rendimento creditado em conta vira receita na categoria "Rendimentos de investimentos" e entra na rentabilidade.',
    },
    taxa: {
      titulo: 'Nova taxa', conta: 'Conta debitada', valor: 'Valor cobrado (R$)',
      dica: 'Só para taxas cobradas à parte na conta, como custódia mensal. Taxas embutidas na cota já aparecem no valor atual e não se registram.',
    },
  };

  /* ---------- Blocos de HTML ---------- */

  function atributos(dados) {
    return Object.keys(dados || {})
      .map(function (k) {
        return ' data-' + k + '="' + esc(dados[k]) + '"';
      })
      .join('');
  }

  function botao(acao, icone, rotulo, dados) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '"' + atributos(dados) +
      ' title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) + '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  }

  function botaoTexto(acao, icone, texto, classe, dados) {
    return (
      '<button type="button" class="botao ' + classe + '" data-acao="' + acao + '"' + atributos(dados) +
      '><span class="icone" aria-hidden="true">' + icone + '</span>' + esc(texto) + '</button>'
    );
  }

  function classeResultado(valor) {
    return valor > 0 ? 'valor-positivo' : valor < 0 ? 'valor-negativo' : '';
  }

  function textoRentabilidade(r) {
    return U.formatarMoeda(r.rentabilidade) + ' (' + U.formatarPercentual(r.rentabilidadePct) + ')';
  }

  function itemTotal(rotulo, valorHtml, dica) {
    return (
      '<div class="total-item"><span class="total-item__rotulo">' + rotulo + '</span>' + valorHtml +
      (dica ? '<span class="texto-fraco">' + dica + '</span>' : '') + '</div>'
    );
  }

  function htmlCarteira(carteira) {
    const valor = function (v, classe) {
      return '<span class="total-item__valor ' + (classe || '') + '">' + v + '</span>';
    };
    const distribuicao = carteira.porClasse.length
      ? '<div class="subtitulo" style="margin-top:var(--esp-4)">Distribuição por classe</div>' +
        carteira.porClasse.map(function (c) {
          return (
            '<div class="linha-simples"><span class="linha-simples__texto">' + esc(App.investimentos.CLASSES[c.classe] || c.classe) +
            '</span><span>' + U.formatarMoeda(c.valorAtual) + ' · ' + U.formatarPercentual(c.pct) + '</span></div>' +
            '<div class="barra-limite" style="margin:0 0 var(--esp-2)"><div class="barra-limite__uso" style="width:' + Math.round(c.pct * 100) + '%"></div></div>'
          );
        }).join('')
      : '';
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Carteira</h2>' +
      '<p class="texto-secundario">Rentabilidade = valor atual + resgates + rendimentos recebidos − aportes − taxas cobradas à parte.</p></div>' +
      botaoTexto('novo-investimento', 'add', 'Novo investimento', 'botao--primario') + '</div>' +
      '<div class="totais">' +
      itemTotal('Total aportado', valor(U.formatarMoeda(carteira.aportado))) +
      itemTotal('Valor atual', valor(U.formatarMoeda(carteira.valorAtual))) +
      itemTotal('Rentabilidade', valor(U.formatarMoeda(carteira.rentabilidade), classeResultado(carteira.rentabilidade)), U.formatarPercentual(carteira.rentabilidadePct) + ' sobre o total aportado') +
      itemTotal('Resgatado', valor(U.formatarMoeda(carteira.resgatado))) +
      itemTotal('Rendimentos recebidos', valor(U.formatarMoeda(carteira.rendimentos))) +
      itemTotal('Taxas à parte', valor(U.formatarMoeda(carteira.taxas))) +
      '</div>' + distribuicao + '</section>'
    );
  }

  function htmlLista(lista, selecionado) {
    let corpo;
    if (!lista.length) {
      corpo = '<p class="vazio">Nenhum investimento cadastrado ainda. Cadastre o primeiro para registrar aportes e acompanhar a rentabilidade.</p>';
    } else {
      corpo =
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Investimento</th><th>Classe</th><th class="numero">Aportado</th><th class="numero">Valor atual</th><th class="numero">Rentabilidade</th><th></th></tr></thead><tbody>' +
        lista.map(function (inv) {
          const r = App.investimentos.resumo(inv);
          return (
            '<tr class="' + (selecionado && inv.id === selecionado.id ? 'selecionada ' : '') + (inv.ativo ? '' : 'inativa') + '">' +
            '<td><strong>' + esc(inv.nome) + '</strong>' + (inv.ativo ? '' : ' <span class="etiqueta">Encerrado</span>') +
            '<br><span class="texto-fraco">' + esc(inv.instituicao) + '</span></td>' +
            '<td>' + esc(App.investimentos.CLASSES[inv.classe]) + '</td>' +
            '<td class="numero">' + U.formatarMoeda(r.aportado) + '</td>' +
            '<td class="numero">' + U.formatarMoeda(r.valorAtual) + (r.valorAtualEstimado ? '<br><span class="texto-fraco">estimado</span>' : '<br><span class="texto-fraco">em ' + U.formatarData(r.dataAtualizacao) + (r.valorAtualAjustado ? ' + movimentos' : '') + '</span>') + '</td>' +
            '<td class="numero ' + classeResultado(r.rentabilidade) + '">' + U.formatarMoeda(r.rentabilidade) + '<br><span class="texto-fraco">' + U.formatarPercentual(r.rentabilidadePct) + '</span></td>' +
            '<td class="tabela__acoes">' + botao('ver', 'visibility', 'Ver detalhes', { id: inv.id }) + '</td></tr>'
          );
        }).join('') + '</tbody></table></div>';
    }
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Seus investimentos</h2>' +
      '<p class="texto-secundario">Sem atualização de valor, o valor atual é estimado pelo que foi aportado, sem ganho.</p></div>' +
      F.campo({ nome: 'encerrados', rotulo: 'Mostrar encerrados', tipo: 'caixa', valor: mostrarEncerrados }) + '</div>' + corpo + '</section>'
    );
  }

  function htmlDetalhe(inv) {
    if (!inv) return '';
    const r = App.investimentos.resumo(inv);
    const movimentacoes = inv.movimentacoes.length
      ? '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Conta</th><th class="numero">Valor</th><th></th></tr></thead><tbody>' +
        inv.movimentacoes.slice().reverse().map(function (m) {
          const lan = App.lancamentos.obter(m.lancamentoId);
          const conta = lan ? App.contas.obter(lan.contaId) : null;
          const t = ETIQUETA_TIPO[m.tipo] || [m.tipo, ''];
          return (
            '<tr><td>' + U.formatarData(m.data) + '</td><td><span class="etiqueta ' + t[1] + '">' + t[0] + '</span></td>' +
            '<td>' + (conta ? esc(conta.nome) : '—') + '</td><td class="numero">' + U.formatarMoeda(m.valor) + '</td>' +
            '<td class="tabela__acoes">' + botao('excluir-movimentacao', 'delete', 'Excluir movimentação', { lancamento: m.lancamentoId }) + '</td></tr>'
          );
        }).join('') + '</tbody></table></div>'
      : '<p class="vazio">Nenhuma movimentação ainda.</p>';
    const historico = inv.atualizacoes.length
      ? inv.atualizacoes.slice().reverse().map(function (a) {
          return (
            '<div class="linha-simples"><span class="linha-simples__texto">' + U.formatarData(a.data) + '</span><span>' + U.formatarMoeda(a.valorAtual) + '</span>' +
            botao('remover-atualizacao', 'close', 'Remover atualização', { data: a.data }) + '</div>'
          );
        }).join('')
      : '<p class="texto-fraco">Nenhuma atualização de valor ainda.</p>';

    return (
      '<section class="painel" data-detalhe><div class="painel__topo"><div><h2>' + esc(inv.nome) + '</h2>' +
      '<p class="texto-secundario">' + esc(App.investimentos.CLASSES[inv.classe]) + ' · ' + esc(inv.instituicao) +
      (inv.quantidade !== null ? ' · quantidade ' + String(inv.quantidade).replace('.', ',') : '') + '</p></div>' +
      '<div class="painel__acoes">' +
      botaoTexto('editar-investimento', 'edit', 'Editar', 'botao--fantasma botao--pequeno') +
      botaoTexto('alternar-investimento', inv.ativo ? 'block' : 'check_circle', inv.ativo ? 'Encerrar' : 'Reativar', 'botao--fantasma botao--pequeno') +
      botaoTexto('excluir-investimento', 'delete', 'Excluir', 'botao--fantasma botao--pequeno') + '</div></div>' +
      '<div class="painel__acoes" style="margin-bottom:var(--esp-4)">' +
      botaoTexto('movimentar', 'south_west', 'Aporte', 'botao--secundario botao--pequeno', { tipo: 'aporte' }) +
      botaoTexto('movimentar', 'north_east', 'Resgate', 'botao--secundario botao--pequeno', { tipo: 'resgate' }) +
      botaoTexto('movimentar', 'payments', 'Rendimento', 'botao--secundario botao--pequeno', { tipo: 'rendimento' }) +
      botaoTexto('movimentar', 'percent', 'Taxa', 'botao--secundario botao--pequeno', { tipo: 'taxa' }) +
      botaoTexto('atualizar-valor', 'update', 'Atualizar valor', 'botao--primario botao--pequeno') + '</div>' +
      '<div class="totais">' +
      itemTotal('Aportado', '<span class="total-item__valor">' + U.formatarMoeda(r.aportado) + '</span>') +
      itemTotal('Valor atual', '<span class="total-item__valor">' + U.formatarMoeda(r.valorAtual) + '</span>',
        r.valorAtualEstimado ? 'Estimado: informe o valor atual'
          : 'Atualizado em ' + U.formatarData(r.dataAtualizacao) + (r.valorAtualAjustado ? ', mais os aportes e resgates feitos depois' : '')) +
      itemTotal('Rentabilidade', '<span class="total-item__valor ' + classeResultado(r.rentabilidade) + '">' + textoRentabilidade(r) + '</span>') +
      itemTotal('Resgatado', '<span class="total-item__valor">' + U.formatarMoeda(r.resgatado) + '</span>') +
      itemTotal('Rendimentos recebidos', '<span class="total-item__valor">' + U.formatarMoeda(r.rendimentos) + '</span>') +
      itemTotal('Taxas à parte', '<span class="total-item__valor">' + U.formatarMoeda(r.taxas) + '</span>') +
      '</div>' +
      '<div class="detalhe-fatura"><div class="detalhe-fatura__bloco--cheio"><div class="subtitulo">Movimentações</div>' + movimentacoes + '</div>' +
      '<div class="detalhe-fatura__bloco--cheio"><div class="subtitulo">Histórico de valores</div>' + historico + '</div></div></section>'
    );
  }

  /* ---------- Formulários ---------- */

  // "10,5" -> 10.5; vazio -> null; texto inválido -> NaN (o cadastro recusa).
  function lerQuantidade(texto) {
    const limpo = String(texto || '').trim().replace(/\s/g, '');
    if (!limpo) return null;
    const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
  }

  function abrirInvestimento(inv) {
    const classes = Object.keys(App.investimentos.CLASSES).map(function (k) {
      return { valor: k, rotulo: App.investimentos.CLASSES[k] };
    });
    return App.modal.abrir({
      titulo: inv ? 'Editar investimento' : 'Novo investimento',
      corpo: F.grade(
        F.campo({ nome: 'nome', rotulo: 'Nome', valor: inv && inv.nome, obrigatorio: true, maxlength: 80, inteiro: true }) +
          F.campo({ nome: 'classe', rotulo: 'Classe', tipo: 'select', opcoes: classes, valor: inv ? inv.classe : 'renda_fixa', obrigatorio: true }) +
          F.campo({ nome: 'instituicao', rotulo: 'Instituição', valor: inv && inv.instituicao, obrigatorio: true, maxlength: 60 }) +
          F.campo({
            nome: 'quantidade', rotulo: 'Quantidade (opcional)', valor: inv && inv.quantidade !== null ? String(inv.quantidade).replace('.', ',') : '',
            inteiro: true, dica: 'Para ações, FIIs e criptomoedas. Pode ser fracionada, como 0,00215.',
          })
      ),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const quantidade = lerQuantidade(v.quantidade);
        if (Number.isNaN(quantidade)) throw new App.ErroValidacao('A quantidade precisa ser um número, como 10 ou 0,00215.');
        const dados = { nome: v.nome, classe: v.classe, instituicao: v.instituicao, quantidade: quantidade };
        if (inv) return App.investimentos.editar(inv.id, dados);
        const gravou = await App.investimentos.criar(dados);
        const lista = App.dados.registros('investimentos');
        selecionadoId = lista[lista.length - 1].id;
        return gravou;
      },
    });
  }

  function abrirMovimentacao(inv, tipo) {
    const contas = App.contas.listar().filter(function (c) { return c.ativa; });
    if (!contas.length) {
      App.aviso.info('Cadastre uma conta ativa em Contas para registrar movimentações.');
      return Promise.resolve(false);
    }
    const t = TEXTOS[tipo];
    const saldos = App.contas.saldos();
    return App.modal.abrir({
      titulo: t.titulo + ' · ' + inv.nome,
      corpo:
        F.grade(
          F.campo({
            nome: 'contaId', rotulo: t.conta, tipo: 'select', obrigatorio: true, inteiro: true,
            opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome + ' (' + U.formatarMoeda(saldos[c.id]) + ')' }; }),
          }) +
            F.campo({ nome: 'valor', rotulo: t.valor, tipo: 'moeda', obrigatorio: true }) +
            F.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', valor: U.hojeISO(), obrigatorio: true }) +
            F.campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', inteiro: true })
        ) + '<p class="texto-secundario">' + esc(t.dica) + '</p>',
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valor = U.paraCentavos(v.valor);
        if (valor === null) throw new App.ErroValidacao('Informe um valor válido, como 1.500,00.');
        return App.investimentos.registrar(inv.id, tipo, { contaId: v.contaId, valor: valor, data: v.data, observacao: v.observacao });
      },
    });
  }

  function abrirAtualizacao(inv) {
    const r = App.investimentos.resumo(inv);
    return App.modal.abrir({
      titulo: 'Atualizar valor · ' + inv.nome,
      corpo:
        F.grade(
          F.campo({ nome: 'valorAtual', rotulo: 'Valor atual (R$)', tipo: 'moeda', valor: r.valorAtual, obrigatorio: true }) +
            F.campo({ nome: 'data', rotulo: 'Data do valor', tipo: 'data', valor: U.hojeISO(), obrigatorio: true })
        ) +
        '<p class="texto-secundario">Cada atualização guarda a sua data. Informar de novo a mesma data corrige o valor daquele dia. Use 0,00 depois de resgatar tudo.</p>',
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const valorAtual = U.paraCentavos(v.valorAtual);
        if (valorAtual === null) throw new App.ErroValidacao('Informe o valor atual, como 5.234,00.');
        return App.investimentos.atualizarValor(inv.id, { data: v.data, valorAtual: valorAtual });
      },
    });
  }

  /* ---------- Ações ---------- */

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

  function atual() {
    return App.investimentos.obter(selecionadoId);
  }

  const MENSAGEM_MOVIMENTACAO = {
    aporte: 'Aporte registrado.',
    resgate: 'Resgate registrado.',
    rendimento: 'Rendimento registrado como receita.',
    taxa: 'Taxa registrada.',
  };

  const ACOES = {
    ver: function (alvo) {
      selecionadoId = alvo.id;
    },
    'novo-investimento': function () {
      return executar(function () { return abrirInvestimento(null); }, 'Investimento cadastrado.');
    },
    'editar-investimento': function () {
      return executar(function () { return abrirInvestimento(atual()); }, 'Investimento atualizado.');
    },
    'alternar-investimento': function () {
      const inv = atual();
      return executar(function () { return App.investimentos.definirAtivo(inv.id, !inv.ativo); }, inv.ativo ? 'Investimento encerrado.' : 'Investimento reativado.');
    },
    'excluir-investimento': function () {
      const inv = atual();
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Excluir investimento',
          mensagem: 'Excluir "' + inv.nome + '"? Isso não pode ser desfeito.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return false;
        const gravou = await App.investimentos.excluir(inv.id);
        selecionadoId = null;
        return gravou;
      }, 'Investimento excluído.');
    },
    movimentar: function (alvo) {
      const inv = atual();
      return executar(function () { return abrirMovimentacao(inv, alvo.tipo); }, MENSAGEM_MOVIMENTACAO[alvo.tipo]);
    },
    'excluir-movimentacao': function (alvo) {
      const inv = atual();
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Excluir movimentação',
          mensagem: 'Excluir esta movimentação? O lançamento dela na conta também é removido e o saldo da conta é recalculado.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return false;
        return App.investimentos.excluirMovimentacao(inv.id, alvo.lancamento);
      }, 'Movimentação excluída.');
    },
    'atualizar-valor': function () {
      const inv = atual();
      return executar(function () { return abrirAtualizacao(inv); }, 'Valor atualizado.');
    },
    'remover-atualizacao': function (alvo) {
      const inv = atual();
      return executar(async function () {
        const ok = await App.modal.confirmar({
          titulo: 'Remover atualização',
          mensagem: 'Remover a atualização de valor de ' + U.formatarData(alvo.data) + '? O valor atual e a rentabilidade são recalculados.',
          rotuloConfirmar: 'Remover',
          perigo: true,
        });
        if (!ok) return false;
        return App.investimentos.removerAtualizacao(inv.id, alvo.data);
      }, 'Atualização removida.');
    },
  };

  /* ---------- Tela ---------- */

  function render(elemento) {
    const lista = App.investimentos.listar(mostrarEncerrados);
    let selecionado = App.investimentos.obter(selecionadoId);
    if (selecionado && !selecionado.ativo && !mostrarEncerrados) selecionado = null;
    if (!selecionado) selecionado = lista[0] || null;
    selecionadoId = selecionado ? selecionado.id : null;

    elemento.innerHTML =
      '<div data-tela="investimentos">' + htmlCarteira(App.investimentos.resumoDaCarteira()) +
      htmlLista(lista, selecionado) + htmlDetalhe(selecionado) + '</div>';

    const raiz = elemento.firstElementChild;

    // A raiz é recriada a cada desenho, então estes ouvintes não se acumulam.
    raiz.addEventListener('click', async function (evento) {
      const alvoBotao = evento.target.closest('[data-acao]');
      if (!alvoBotao || alvoBotao.disabled) return;
      const tratar = ACOES[alvoBotao.dataset.acao];
      if (!tratar) return;
      const resultado = tratar(Object.assign({}, alvoBotao.dataset));
      if (resultado && typeof resultado.then === 'function') {
        await resultado;
      } else {
        App.roteador.renderizar();
        const detalhe = document.querySelector('[data-detalhe]');
        if (detalhe && alvoBotao.dataset.acao === 'ver') detalhe.scrollIntoView({ block: 'nearest' });
      }
    });

    raiz.addEventListener('change', function (evento) {
      if (evento.target.name === 'encerrados') {
        mostrarEncerrados = evento.target.checked;
        App.roteador.renderizar();
      }
    });
  }

  App.roteador.registrar('investimentos', { titulo: 'Investimentos', icone: 'pie_chart', menu: true, ordem: 5, render: render });
})();
