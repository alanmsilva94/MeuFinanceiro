/* Tela Configurações: categorias (RF-05 a RF-07) e recorrências (RF-13 a RF-15, painel em
   recorrencias.js). Backup e exportação (fase 8) entram depois. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  const COR_PADRAO = { receita: '#15803d', despesa: '#b45309' };

  function botao(acao, id, icone, rotulo) {
    return (
      '<button type="button" class="botao-icone botao-icone--plano" data-acao="' + acao + '" data-id="' + esc(id) +
      '" title="' + esc(rotulo) + '" aria-label="' + esc(rotulo) + '"><span class="icone" aria-hidden="true">' + icone + '</span></button>'
    );
  }

  /* ---------- Formulários ---------- */

  function abrirCategoria(categoria, naturezaInicial) {
    const naturezas = Object.keys(App.categorias.NATUREZAS).map(function (chave) {
      return { valor: chave, rotulo: App.categorias.NATUREZAS[chave] };
    });
    const natureza = categoria ? categoria.natureza : naturezaInicial;
    const sistema = !!categoria && App.categorias.ehDoSistema(categoria);
    return App.modal.abrir({
      titulo: categoria ? 'Editar categoria' : 'Nova categoria',
      corpo: F.grade(
        F.campo({
          nome: 'nome', rotulo: 'Nome', valor: categoria && categoria.nome, obrigatorio: true, maxlength: 40, inteiro: true,
          desabilitado: sistema, dica: sistema ? 'Usada pelo programa: só a cor pode mudar.' : '',
        }) +
          F.campo({ nome: 'natureza', rotulo: 'Tipo', tipo: 'select', opcoes: naturezas, valor: natureza, obrigatorio: true, desabilitado: sistema }) +
          F.campo({ nome: 'cor', rotulo: 'Cor', tipo: 'cor', valor: categoria ? categoria.cor : COR_PADRAO[natureza], obrigatorio: true })
      ),
      aoSalvar: async function (form) {
        const v = F.valores(form);
        const dados = { nome: v.nome, natureza: v.natureza, cor: v.cor };
        return categoria ? App.categorias.editar(categoria.id, dados) : App.categorias.criar(dados);
      },
    });
  }

  // RF-06: categoria em uso só pode ser excluída depois de trocar por outra.
  async function excluirCategoria(categoria) {
    if (App.categorias.ehDoSistema(categoria)) {
      throw new App.ErroValidacao('A categoria "' + categoria.nome + '" é usada pelo programa e não pode ser excluída.');
    }
    const uso = App.categorias.usoDaCategoria(categoria.id);
    if (uso.total === 0) {
      const confirmou = await App.modal.confirmar({
        titulo: 'Excluir categoria',
        mensagem: 'Excluir a categoria "' + categoria.nome + '"? Isso não pode ser desfeito.',
        rotuloConfirmar: 'Excluir',
        perigo: true,
      });
      if (!confirmou) return false;
      return App.categorias.excluir(categoria.id);
    }

    const alternativas = App.categorias.listar(categoria.natureza).filter(function (c) {
      return c.id !== categoria.id;
    });
    if (!alternativas.length) {
      throw new App.ErroValidacao(
        'A categoria "' + categoria.nome + '" está em uso. Crie outra categoria do mesmo tipo para receber os registros e tente de novo.'
      );
    }
    return App.modal.abrir({
      titulo: 'Trocar e excluir categoria',
      rotuloSalvar: 'Trocar e excluir',
      perigo: true,
      corpo:
        '<p>A categoria <strong>' + esc(categoria.nome) + '</strong> está em uso por ' + uso.total +
        ' registro(s). Escolha a categoria que passa a receber esses registros; depois a categoria será excluída.</p>' +
        F.campo({
          nome: 'destino', rotulo: 'Nova categoria', tipo: 'select', obrigatorio: true,
          opcoes: alternativas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }),
        }),
      aoSalvar: async function (form) {
        return App.categorias.trocarEExcluir(categoria.id, F.valores(form).destino);
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

  const ACOES = {
    'nova-categoria': function (natureza) {
      return executar(function () { return abrirCategoria(null, natureza); }, 'Categoria salva.');
    },
    'editar-categoria': function (id) {
      return executar(function () { return abrirCategoria(App.categorias.obter(id)); }, 'Categoria atualizada.');
    },
    'excluir-categoria': function (id) {
      return executar(function () { return excluirCategoria(App.categorias.obter(id)); }, 'Categoria excluída.');
    },
    // Grava a data e a hora no config.json, para confirmar que a pasta aceita alterações.
    'testar-gravacao': function () {
      return executar(async function () {
        const config = App.storage.obter('config');
        const anterior = config.ultimoTesteGravacao;
        config.ultimoTesteGravacao = App.util.agoraISO();
        try {
          await App.storage.salvar('config');
        } catch (erro) {
          config.ultimoTesteGravacao = anterior; // o armazenamento já avisou o motivo
          return false;
        }
        return true;
      }, 'Gravação concluída. Abra config.json na pasta de dados para conferir.');
    },
    // Backup, restauração, Excel e impressão: o painel mostra as próprias mensagens.
    'exportar-backup': function () {
      return executar(function () { return App.telas.backup.exportarBackup(); });
    },
    'copia-agora': function () {
      return executar(function () { return App.telas.backup.copiaAgora(); });
    },
    'restaurar-arquivo': function () {
      App.telas.backup.escolherArquivo(); // precisa acontecer dentro do clique do usuário
    },
    'restaurar-copia': function (_id, alvo) {
      return executar(function () { return App.telas.backup.restaurarDeCopia(alvo.dataset.nome); });
    },
    'exportar-excel': function () {
      return executar(function () { return App.telas.backup.exportarExcel(); });
    },
    imprimir: function () {
      App.telas.backup.imprimir();
    },
    // Recorrências: o painel mostra as próprias mensagens de sucesso.
    'editar-recorrencia': function (id) {
      return executar(function () { return App.telas.recorrencias.editar(id); });
    },
    'alternar-recorrencia': function (id) {
      return executar(function () { return App.telas.recorrencias.alternar(id); });
    },
    'excluir-recorrencia': function (id) {
      return executar(function () { return App.telas.recorrencias.excluir(id); });
    },
  };

  /* ---------- Tela ---------- */

  function painelCategorias(natureza, titulo) {
    const lista = App.categorias.listar(natureza);
    const itens = lista.length
      ? '<ul class="lista-categorias">' + lista.map(function (c) {
          return (
            '<li><span class="cor-ponto" style="background:' + U.corSegura(c.cor) + '" aria-hidden="true"></span>' +
            '<span class="lista-categorias__nome">' + esc(c.nome) + '</span>' +
            botao('editar-categoria', c.id, 'edit', 'Editar categoria') +
            (App.categorias.ehDoSistema(c)
              ? '<span class="icone icone--pequeno" title="Usada pelo programa: não pode ser excluída" aria-label="Protegida">lock</span>'
              : botao('excluir-categoria', c.id, 'delete', 'Excluir categoria')) + '</li>'
          );
        }).join('') + '</ul>'
      : '<p class="vazio">Nenhuma categoria.</p>';
    return (
      '<section class="painel">' +
      '<div class="painel__topo"><h2>' + titulo + '</h2>' +
      '<button type="button" class="botao botao--secundario botao--pequeno" data-acao="nova-categoria" data-id="' + natureza + '">' +
      '<span class="icone" aria-hidden="true">add</span>Nova</button></div>' + itens + '</section>'
    );
  }

  const DESCRICAO_ARQUIVO = {
    config: 'Preferências',
    contas: 'Contas financeiras',
    categorias: 'Categorias',
    lancamentos: 'Lançamentos',
    recorrencias: 'Recorrências',
    cartoes: 'Cartões',
    compras_cartao: 'Compras no cartão',
    faturas: 'Faturas',
    investimentos: 'Investimentos',
  };

  // Situação da pasta de dados e teste de gravação (veio do dashboard provisório da fase 1).
  function painelPastaDeDados() {
    const info = App.storage.estado();
    const linhas = App.storage.ARQUIVOS.map(function (nome) {
      const obj = App.storage.obter(nome);
      const qtd = Array.isArray(obj.registros) ? obj.registros.length : '—';
      return '<tr><td><code>' + nome + '.json</code></td><td>' + DESCRICAO_ARQUIVO[nome] + '</td><td class="numero">' + qtd + '</td></tr>';
    }).join('');
    const duplicados = info.duplicados.length
      ? '<p class="nota-info">Há cópias de arquivos com número no nome: <strong>' + info.duplicados.map(esc).join(', ') +
        '</strong>. O MeuFinanceiro usa só os arquivos sem número; confira se as cópias têm algo que você queira manter e depois apague-as.</p>'
      : '';
    const config = App.storage.obter('config');
    const ultimoTeste = config.ultimoTesteGravacao
      ? 'Último teste de gravação: ' + new Date(config.ultimoTesteGravacao).toLocaleString('pt-BR') + '.'
      : 'Nenhum teste de gravação feito ainda.';
    return (
      '<section class="painel"><div class="painel__topo"><div><h2>Pasta de dados</h2>' +
      '<p class="texto-secundario">A pasta <strong>' + esc(info.pasta) + '</strong> está conectada. ' + ultimoTeste + '</p></div>' +
      '<button type="button" class="botao botao--secundario" data-acao="testar-gravacao"><span class="icone" aria-hidden="true">save</span>Testar gravação</button></div>' +
      duplicados +
      '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Arquivo</th><th>Conteúdo</th><th class="numero">Registros</th></tr></thead><tbody>' +
      linhas + '</tbody></table></div></section>'
    );
  }

  function render(elemento) {
    elemento.innerHTML =
      '<div data-tela="configuracoes">' +
      '<div class="painel__topo" style="margin-bottom:var(--esp-4)"><div><h2>Categorias</h2>' +
      '<p class="texto-secundario">Organize receitas e despesas do seu jeito. Categorias em uso só podem ser excluídas depois de trocadas por outra.</p></div></div>' +
      '<div class="grade-duas">' +
      painelCategorias('receita', 'Receitas') +
      painelCategorias('despesa', 'Despesas') +
      '</div>' +
      '<div style="margin-top:var(--esp-4)">' +
      App.telas.recorrencias.html() +
      painelPastaDeDados() +
      App.telas.backup.html() +
      '</div></div>';

    App.telas.backup.ligar(elemento.firstElementChild);

    elemento.firstElementChild.addEventListener('click', function (evento) {
      const alvo = evento.target.closest('[data-acao]');
      if (!alvo || alvo.disabled) return;
      const tratar = ACOES[alvo.dataset.acao];
      if (tratar) tratar(alvo.dataset.id, alvo);
    });
  }

  App.roteador.registrar('configuracoes', { titulo: 'Configurações', icone: 'settings', menu: true, ordem: 7, render: render });
})();
