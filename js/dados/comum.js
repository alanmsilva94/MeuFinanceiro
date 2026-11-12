/* Base da camada de dados: erro de validação e funções que os cadastros compartilham.

   Regra de uso: cada função de cadastro valida tudo ANTES de mexer nos dados.
   Se algo for inválido, lança ErroValidacao (a tela mostra a mensagem) e nada é alterado.
   Depois de validar, altera a memória e grava os arquivos afetados de uma vez. */
(function () {
  'use strict';

  class ErroValidacao extends Error {
    constructor(mensagem) {
      super(mensagem);
      this.name = 'ErroValidacao';
    }
  }

  function registros(nomeArquivo) {
    return App.storage.obter(nomeArquivo).registros;
  }

  // Grava os arquivos informados. Devolve true se todos foram gravados.
  // Se a gravação falhar, o armazenamento já avisou o usuário e mantém a alteração na memória
  // para tentar de novo; por isso não desfazemos nada aqui.
  async function gravar(nomes) {
    const unicos = Array.from(new Set(nomes));
    const resultados = await Promise.allSettled(
      unicos.map(function (nome) {
        return App.storage.salvar(nome);
      })
    );
    return resultados.every(function (r) {
      return r.status === 'fulfilled';
    });
  }

  // Texto obrigatório: tira espaços sobrando e confere o tamanho.
  function textoObrigatorio(valor, descricao, maximo) {
    const texto = String(valor === undefined || valor === null ? '' : valor)
      .trim()
      .replace(/\s+/g, ' ');
    if (!texto) throw new ErroValidacao('Informe ' + descricao + '.');
    if (texto.length > maximo) {
      throw new ErroValidacao('Use no máximo ' + maximo + ' caracteres em ' + descricao + '.');
    }
    return texto;
  }

  // Texto opcional, com limite de tamanho.
  function textoOpcional(valor, descricao, maximo) {
    const texto = String(valor === undefined || valor === null ? '' : valor).trim();
    if (texto.length > maximo) {
      throw new ErroValidacao('Use no máximo ' + maximo + ' caracteres em ' + descricao + '.');
    }
    return texto;
  }

  function chaveDeNome(nome) {
    return nome.toLocaleLowerCase('pt-BR');
  }

  function porNome(a, b) {
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  }

  App.ErroValidacao = ErroValidacao;
  App.dados = {
    registros: registros,
    gravar: gravar,
    textoObrigatorio: textoObrigatorio,
    textoOpcional: textoOpcional,
    chaveDeNome: chaveDeNome,
    porNome: porNome,
  };
})();
