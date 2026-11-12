/* Cadastro de contas financeiras (RF-01 a RF-04). */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;

  const TIPOS = {
    corrente: 'Conta corrente',
    poupanca: 'Poupança',
    dinheiro: 'Dinheiro',
    carteira_digital: 'Carteira digital',
  };

  function listar() {
    return D.registros('contas').slice().sort(D.porNome);
  }

  function obter(id) {
    return D.registros('contas').find(function (c) {
      return c.id === id;
    });
  }

  function validar(dados, idAtual) {
    const nome = D.textoObrigatorio(dados.nome, 'o nome da conta', 60);
    const instituicao = D.textoObrigatorio(dados.instituicao, 'a instituição', 60);
    if (!TIPOS[dados.tipo]) throw new Erro('Escolha o tipo da conta.');
    if (!Number.isSafeInteger(dados.saldoInicial)) {
      throw new Erro('Informe um saldo inicial válido, como 1.250,00 ou -300,00. Use 0,00 se a conta começa zerada.');
    }
    if (!U.ehDataISO(dados.dataAbertura)) throw new Erro('Informe a data de abertura da conta.');
    const repetida = D.registros('contas').some(function (c) {
      return c.id !== idAtual && D.chaveDeNome(c.nome) === D.chaveDeNome(nome);
    });
    if (repetida) throw new Erro('Já existe uma conta chamada "' + nome + '". Use outro nome.');
    return {
      nome: nome,
      instituicao: instituicao,
      tipo: dados.tipo,
      saldoInicial: dados.saldoInicial,
      dataAbertura: dados.dataAbertura,
    };
  }

  async function criar(dados) {
    const valores = validar(dados, null);
    const agora = U.agoraISO();
    const conta = Object.assign({ id: U.gerarId('acc') }, valores, {
      ativa: true,
      criadoEm: agora,
      alteradoEm: agora,
    });
    D.registros('contas').push(conta);
    return D.gravar(['contas']);
  }

  async function editar(id, dados) {
    const conta = obter(id);
    if (!conta) throw new Erro('Conta não encontrada.');
    Object.assign(conta, validar(dados, id), { alteradoEm: U.agoraISO() });
    return D.gravar(['contas']);
  }

  async function definirAtiva(id, ativa) {
    const conta = obter(id);
    if (!conta) throw new Erro('Conta não encontrada.');
    conta.ativa = !!ativa;
    conta.alteradoEm = U.agoraISO();
    return D.gravar(['contas']);
  }

  // Quantos registros dependem desta conta.
  function usoDaConta(id) {
    const lancamentos = D.registros('lancamentos').filter(function (l) {
      return l.contaId === id || l.contaDestinoId === id;
    }).length;
    const recorrencias = D.registros('recorrencias').filter(function (r) {
      return r.modelo && r.modelo.contaId === id;
    }).length;
    return { lancamentos: lancamentos, recorrencias: recorrencias, total: lancamentos + recorrencias };
  }

  // RF-04: conta com lançamentos não pode ser excluída, só inativada.
  async function excluir(id) {
    const conta = obter(id);
    if (!conta) throw new Erro('Conta não encontrada.');
    const uso = usoDaConta(id);
    if (uso.total > 0) {
      throw new Erro(
        'A conta "' + conta.nome + '" tem ' + uso.lancamentos + ' lançamento(s)' +
          (uso.recorrencias ? ' e ' + uso.recorrencias + ' recorrência(s)' : '') +
          ' e não pode ser excluída. Inative a conta para escondê-la das listas.'
      );
    }
    const lista = D.registros('contas');
    lista.splice(lista.indexOf(conta), 1);
    return D.gravar(['contas']);
  }

  // Saldo atual de cada conta: { idDaConta: centavos }.
  function saldos() {
    return App.calc.saldos(D.registros('contas'), D.registros('lancamentos'));
  }

  App.contas = {
    TIPOS: TIPOS,
    listar: listar,
    obter: obter,
    criar: criar,
    editar: editar,
    definirAtiva: definirAtiva,
    excluir: excluir,
    usoDaConta: usoDaConta,
    saldos: saldos,
  };
})();
