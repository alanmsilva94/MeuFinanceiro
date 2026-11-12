/* Cadastro de categorias de receitas e despesas (RF-05 a RF-07).
   A lista inicial é criada pelo armazenamento na primeira execução (RF-07). */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;

  const NATUREZAS = { receita: 'Receita', despesa: 'Despesa' };

  // Categorias que o programa usa sozinho (rendimentos na fase 6, encargos de cartão na fase 5).
  // Podem mudar de cor, mas não de nome nem de tipo, e não podem ser excluídas.
  const DO_SISTEMA = [
    { nome: 'Rendimentos de investimentos', natureza: 'receita', cor: '#15803d' },
    { nome: 'Encargos de cartão', natureza: 'despesa', cor: '#b91c1c' },
  ];

  function ehDoSistema(categoria) {
    return DO_SISTEMA.some(function (s) {
      return s.natureza === categoria.natureza && D.chaveDeNome(s.nome) === D.chaveDeNome(categoria.nome);
    });
  }

  function erroDoSistema(categoria, acao) {
    return new Erro(
      'A categoria "' + categoria.nome + '" é usada pelo programa e não pode ser ' + acao +
        '. Você pode mudar a cor dela.'
    );
  }

  // Devolve a categoria do sistema, criando-a (só na memória) se ela não existir mais.
  // `criada` avisa quem chamou que precisa gravar categorias.json também.
  function garantirDoSistema(nome) {
    const modelo = DO_SISTEMA.find(function (s) {
      return s.nome === nome;
    });
    const existente = D.registros('categorias').find(function (c) {
      return c.natureza === modelo.natureza && D.chaveDeNome(c.nome) === D.chaveDeNome(modelo.nome);
    });
    if (existente) return { categoria: existente, criada: false };
    const agora = U.agoraISO();
    const categoria = Object.assign({ id: U.gerarId('cat') }, modelo, { criadoEm: agora, alteradoEm: agora });
    D.registros('categorias').push(categoria);
    return { categoria: categoria, criada: true };
  }

  function listar(natureza) {
    return D.registros('categorias')
      .filter(function (c) {
        return !natureza || c.natureza === natureza;
      })
      .sort(D.porNome);
  }

  function obter(id) {
    return D.registros('categorias').find(function (c) {
      return c.id === id;
    });
  }

  // Quantos registros usam a categoria, e onde.
  function usoDaCategoria(id) {
    const lancamentos = D.registros('lancamentos').filter(function (l) {
      return l.categoriaId === id;
    }).length;
    const recorrencias = D.registros('recorrencias').filter(function (r) {
      return r.modelo && r.modelo.categoriaId === id;
    }).length;
    const compras = D.registros('compras_cartao').filter(function (c) {
      return c.categoriaId === id;
    }).length;
    return {
      lancamentos: lancamentos,
      recorrencias: recorrencias,
      compras: compras,
      total: lancamentos + recorrencias + compras,
    };
  }

  function validar(dados, atual) {
    const nome = D.textoObrigatorio(dados.nome, 'o nome da categoria', 40);
    if (!NATUREZAS[dados.natureza]) throw new Erro('Escolha se a categoria é de receita ou de despesa.');
    if (!/^#[0-9a-f]{6}$/i.test(String(dados.cor || ''))) throw new Erro('Escolha uma cor para a categoria.');
    if (atual && atual.natureza !== dados.natureza && usoDaCategoria(atual.id).total > 0) {
      throw new Erro(
        'A categoria "' + atual.nome + '" já está em uso e não pode mudar entre receita e despesa. Crie outra categoria.'
      );
    }
    const repetida = D.registros('categorias').some(function (c) {
      return (
        (!atual || c.id !== atual.id) &&
        c.natureza === dados.natureza &&
        D.chaveDeNome(c.nome) === D.chaveDeNome(nome)
      );
    });
    if (repetida) {
      throw new Erro('Já existe uma categoria de ' + NATUREZAS[dados.natureza].toLowerCase() + ' chamada "' + nome + '".');
    }
    return { nome: nome, natureza: dados.natureza, cor: dados.cor.toLowerCase() };
  }

  async function criar(dados) {
    const valores = validar(dados, null);
    const agora = U.agoraISO();
    D.registros('categorias').push(
      Object.assign({ id: U.gerarId('cat') }, valores, { criadoEm: agora, alteradoEm: agora })
    );
    return D.gravar(['categorias']);
  }

  async function editar(id, dados) {
    const categoria = obter(id);
    if (!categoria) throw new Erro('Categoria não encontrada.');
    if (
      ehDoSistema(categoria) &&
      (D.chaveDeNome(String(dados.nome || '').trim()) !== D.chaveDeNome(categoria.nome) || dados.natureza !== categoria.natureza)
    ) {
      throw erroDoSistema(categoria, 'renomeada nem mudar de tipo');
    }
    Object.assign(categoria, validar(dados, categoria), { alteradoEm: U.agoraISO() });
    return D.gravar(['categorias']);
  }

  function remover(categoria) {
    const lista = D.registros('categorias');
    lista.splice(lista.indexOf(categoria), 1);
  }

  // RF-06: categoria em uso não é excluída diretamente.
  async function excluir(id) {
    const categoria = obter(id);
    if (!categoria) throw new Erro('Categoria não encontrada.');
    if (ehDoSistema(categoria)) throw erroDoSistema(categoria, 'excluída');
    const uso = usoDaCategoria(id);
    if (uso.total > 0) {
      throw new Erro(
        'A categoria "' + categoria.nome + '" está em uso por ' + uso.total +
          ' registro(s). Troque-a por outra categoria antes de excluir.'
      );
    }
    remover(categoria);
    return D.gravar(['categorias']);
  }

  // RF-06: passa tudo que usa a categoria para outra da mesma natureza e depois exclui.
  // Tudo é conferido antes; as alterações de vários arquivos são feitas e gravadas juntas.
  async function trocarEExcluir(id, destinoId) {
    const categoria = obter(id);
    const destino = obter(destinoId);
    if (!categoria) throw new Erro('Categoria não encontrada.');
    if (ehDoSistema(categoria)) throw erroDoSistema(categoria, 'excluída');
    if (!destino) throw new Erro('Escolha a categoria que vai receber os registros.');
    if (destino.id === categoria.id) throw new Erro('Escolha uma categoria diferente da que será excluída.');
    if (destino.natureza !== categoria.natureza) {
      throw new Erro('A nova categoria precisa ser do mesmo tipo (receita ou despesa).');
    }
    const agora = U.agoraISO();
    D.registros('lancamentos').forEach(function (l) {
      if (l.categoriaId === id) {
        l.categoriaId = destinoId;
        l.alteradoEm = agora;
      }
    });
    D.registros('recorrencias').forEach(function (r) {
      if (r.modelo && r.modelo.categoriaId === id) {
        r.modelo.categoriaId = destinoId;
        r.alteradoEm = agora;
      }
    });
    D.registros('compras_cartao').forEach(function (c) {
      if (c.categoriaId === id) {
        c.categoriaId = destinoId;
        c.alteradoEm = agora;
      }
    });
    remover(categoria);
    return D.gravar(['lancamentos', 'recorrencias', 'compras_cartao', 'categorias']);
  }

  App.categorias = {
    NATUREZAS: NATUREZAS,
    ehDoSistema: ehDoSistema,
    garantirDoSistema: garantirDoSistema,
    listar: listar,
    obter: obter,
    usoDaCategoria: usoDaCategoria,
    criar: criar,
    editar: editar,
    excluir: excluir,
    trocarEExcluir: trocarEExcluir,
  };
})();
