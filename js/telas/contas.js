/* Tela Contas: lista com saldos, cadastro e transferências entre contas (RF-01 a RF-04). */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  const ICONE_ACAO = function (acao, id, icone, rotulo) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '" data-id="' + esc(id) +
      '" title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) + '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  };

  function nomeDaConta(id) {
    const conta = App.contas.obter(id);
    return conta ? esc(conta.nome) : '—';
  }

  /* ---------- Conta ---------- */

  function corpoConta(conta) {
    const tipos = Object.keys(App.contas.TIPOS).map(function (chave) {
      return { valor: chave, rotulo: App.contas.TIPOS[chave] };
    });
    return F.grade(
      F.campo({ nome: 'nome', rotulo: 'Nome da conta', valor: conta && conta.nome, obrigatorio: true, maxlength: 60, inteiro: true }) +
        F.campo({ nome: 'instituicao', rotulo: 'Instituição', valor: conta && conta.instituicao, obrigatorio: true, maxlength: 60 }) +
        F.campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: tipos, valor: conta ? conta.tipo : 'corrente', obrigatorio: true }) +
        F.campo({
          nome: 'saldoInicial', rotulo: 'Saldo inicial (R$)', tipo: 'moeda', obrigatorio: true,
          valor: conta ? conta.saldoInicial : '', dica: 'O saldo atual é calculado a partir dele e dos lançamentos pagos ou recebidos.',
        }) +
        F.campo({ nome: 'dataAbertura', rotulo: 'Data de abertura', tipo: 'data', valor: conta ? conta.dataAbertura : U.hojeISO(), obrigatorio: true })
    );
  }

  function abrirConta(conta) {
    return App.modal.abrir({
      titulo: conta ? 'Editar conta' : 'Nova conta',
      corpo: corpoConta(conta),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const dados = {
          nome: v.nome,
          instituicao: v.instituicao,
          tipo: v.tipo,
          saldoInicial: U.paraCentavos(v.saldoInicial),
          dataAbertura: v.dataAbertura,
        };
        return conta ? App.contas.editar(conta.id, dados) : App.contas.criar(dados);
      },
    });
  }

  /* ---------- Transferência ---------- */

  function corpoTransferencia(transferencia) {
    const contas = App.contas.listar().filter(function (c) {
      return c.ativa || (transferencia && (transferencia.contaId === c.id || transferencia.contaDestinoId === c.id));
    });
    const opcoes = contas.map(function (c) {
      return { valor: c.id, rotulo: c.nome + (c.ativa ? '' : ' (inativa)') };
    });
    return F.grade(
      F.campo({ nome: 'contaId', rotulo: 'Conta de origem', tipo: 'select', opcoes: opcoes, valor: transferencia ? transferencia.contaId : contas[0].id, obrigatorio: true }) +
        F.campo({ nome: 'contaDestinoId', rotulo: 'Conta de destino', tipo: 'select', opcoes: opcoes, valor: transferencia ? transferencia.contaDestinoId : contas[1].id, obrigatorio: true }) +
        F.campo({ nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', valor: transferencia ? transferencia.valor : '', obrigatorio: true }) +
        F.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', valor: transferencia ? transferencia.dataPagamento : U.hojeISO(), obrigatorio: true }) +
        F.campo({ nome: 'observacao', rotulo: 'Observação', tipo: 'textarea', valor: transferencia && transferencia.observacao, inteiro: true })
    );
  }

  function abrirTransferencia(transferencia) {
    return App.modal.abrir({
      titulo: transferencia ? 'Editar transferência' : 'Nova transferência',
      corpo: corpoTransferencia(transferencia),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const dados = {
          contaId: v.contaId,
          contaDestinoId: v.contaDestinoId,
          valor: U.paraCentavos(v.valor),
          data: v.data,
          observacao: v.observacao,
        };
        if (dados.valor === null) throw new App.ErroValidacao('Informe um valor válido, como 150,00.');
        return transferencia
          ? App.lancamentos.editarTransferencia(transferencia.id, dados)
          : App.lancamentos.criarTransferencia(dados);
      },
    });
  }

  /* ---------- Ações ---------- */

  async function executar(acao, mensagemSucesso) {
    try {
      const resultado = await acao();
      // false = cancelou ou não gravou na pasta (o armazenamento já avisou); sem mensagem de sucesso.
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

  const ACOES = {
    'nova-conta': function () {
      return executar(function () { return abrirConta(null); }, 'Conta salva.');
    },
    'editar-conta': function (id) {
      return executar(function () { return abrirConta(App.contas.obter(id)); }, 'Conta atualizada.');
    },
    'alternar-conta': function (id) {
      const conta = App.contas.obter(id);
      return executar(function () { return App.contas.definirAtiva(id, !conta.ativa); }, conta.ativa ? 'Conta inativada.' : 'Conta reativada.');
    },
    'excluir-conta': function (id) {
      const conta = App.contas.obter(id);
      return executar(async function () {
        const confirmou = await App.modal.confirmar({
          titulo: 'Excluir conta',
          mensagem: 'Excluir a conta "' + conta.nome + '"? Isso não pode ser desfeito.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!confirmou) return false;
        return App.contas.excluir(id);
      }, 'Conta excluída.');
    },
    'nova-transferencia': function () {
      const ativas = App.contas.listar().filter(function (c) { return c.ativa; });
      if (ativas.length < 2) {
        App.aviso.info('Para transferir, cadastre pelo menos duas contas ativas.');
        return undefined;
      }
      return executar(function () { return abrirTransferencia(null); }, 'Transferência registrada.');
    },
    'editar-transferencia': function (id) {
      return executar(function () { return abrirTransferencia(App.lancamentos.obter(id)); }, 'Transferência atualizada.');
    },
    'excluir-transferencia': function (id) {
      return executar(async function () {
        const confirmou = await App.modal.confirmar({
          titulo: 'Excluir transferência',
          mensagem: 'Excluir esta transferência? Os saldos das duas contas voltam ao que eram antes dela.',
          rotuloConfirmar: 'Excluir',
          perigo: true,
        });
        if (!confirmou) return false;
        return App.lancamentos.excluirTransferencia(id);
      }, 'Transferência excluída.');
    },
  };

  /* ---------- Tela ---------- */

  function tabelaContas(contas, saldos) {
    if (!contas.length) {
      return '<p class="vazio">Nenhuma conta cadastrada ainda. Cadastre sua primeira conta para começar a acompanhar os saldos.</p>';
    }
    const linhas = contas.map(function (c) {
      const saldo = saldos[c.id];
      return (
        '<tr class="' + (c.ativa ? '' : 'inativa') + '">' +
        '<td><strong>' + esc(c.nome) + '</strong></td>' +
        '<td>' + esc(c.instituicao) + '</td>' +
        '<td>' + esc(App.contas.TIPOS[c.tipo] || c.tipo) + '</td>' +
        '<td class="numero ' + (saldo < 0 ? 'valor-negativo' : '') + '">' + U.formatarMoeda(saldo) + '</td>' +
        '<td>' + (c.ativa ? '<span class="etiqueta etiqueta--sucesso">Ativa</span>' : '<span class="etiqueta">Inativa</span>') + '</td>' +
        '<td class="tabela__acoes">' +
        ICONE_ACAO('editar-conta', c.id, 'edit', 'Editar conta') +
        ICONE_ACAO('alternar-conta', c.id, c.ativa ? 'block' : 'check_circle', c.ativa ? 'Inativar conta' : 'Reativar conta') +
        ICONE_ACAO('excluir-conta', c.id, 'delete', 'Excluir conta') +
        '</td></tr>'
      );
    }).join('');
    return (
      '<div class="tabela-rolagem"><table class="tabela">' +
      '<thead><tr><th>Conta</th><th>Instituição</th><th>Tipo</th><th class="numero">Saldo atual</th><th>Situação</th><th></th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>'
    );
  }

  function tabelaTransferencias(lista) {
    if (!lista.length) {
      return '<p class="vazio">Nenhuma transferência em ' + esc(U.nomeMes(App.estado.mes)) + '.</p>';
    }
    const linhas = lista.map(function (t) {
      return (
        '<tr><td>' + U.formatarData(t.dataPagamento) + '</td>' +
        '<td>' + nomeDaConta(t.contaId) + '</td>' +
        '<td>' + nomeDaConta(t.contaDestinoId) + '</td>' +
        '<td class="texto-secundario">' + esc(t.observacao || '') + '</td>' +
        '<td class="numero">' + U.formatarMoeda(t.valor) + '</td>' +
        '<td class="tabela__acoes">' +
        ICONE_ACAO('editar-transferencia', t.id, 'edit', 'Editar transferência') +
        ICONE_ACAO('excluir-transferencia', t.id, 'delete', 'Excluir transferência') +
        '</td></tr>'
      );
    }).join('');
    return (
      '<div class="tabela-rolagem"><table class="tabela">' +
      '<thead><tr><th>Data</th><th>De</th><th>Para</th><th>Observação</th><th class="numero">Valor</th><th></th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>'
    );
  }

  function render(elemento) {
    const contas = App.contas.listar();
    const saldos = App.contas.saldos();
    const total = App.calc.saldoTotal(contas, saldos);

    elemento.innerHTML =
      '<div data-tela="contas">' +
      '<section class="painel">' +
      '<div class="painel__topo"><div>' +
      '<h2>Saldo em contas</h2>' +
      '<p class="texto-secundario">Soma de todas as contas (inclusive as inativas), considerando só o que já foi pago ou recebido.</p>' +
      '<p class="total-destaque ' + (total < 0 ? 'valor-negativo' : '') + '" style="margin-top:8px">' + U.formatarMoeda(total) + '</p>' +
      '</div>' +
      '<div class="painel__acoes">' +
      '<button type="button" class="botao botao--secundario" data-acao="nova-transferencia"><span class="icone" aria-hidden="true">swap_horiz</span>Nova transferência</button>' +
      '<button type="button" class="botao botao--primario" data-acao="nova-conta"><span class="icone" aria-hidden="true">add</span>Nova conta</button>' +
      '</div></div>' +
      tabelaContas(contas, saldos) +
      '</section>' +
      '<section class="painel">' +
      '<div class="painel__topo"><div><h2>Transferências de ' + esc(U.nomeMes(App.estado.mes)) + '</h2>' +
      '<p class="texto-secundario">Mover dinheiro entre contas não é receita nem despesa.</p></div></div>' +
      tabelaTransferencias(App.lancamentos.listarTransferencias(App.estado.mes)) +
      '</section></div>';

    // A raiz é recriada a cada desenho, então este ouvinte não se acumula.
    elemento.firstElementChild.addEventListener('click', function (evento) {
      const botao = evento.target.closest('[data-acao]');
      if (!botao || botao.disabled) return;
      const tratar = ACOES[botao.dataset.acao];
      if (tratar) tratar(botao.dataset.id);
    });
  }

  App.roteador.registrar('contas', { titulo: 'Contas', icone: 'account_balance_wallet', menu: true, ordem: 6, render: render });
})();
