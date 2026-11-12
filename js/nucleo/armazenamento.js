/* Armazenamento dos dados em arquivos JSON numa pasta escolhida pelo usuário
   (pasta local, pasta na rede local ou pasta sincronizada).

   - Usa a File System Access API (Chrome e Edge), que funciona com o index.html aberto direto.
   - A referência da pasta fica guardada no IndexedDB; ao reabrir, basta um clique para reautorizar.
   - Ao conectar, todos os arquivos são lidos para a memória. Cada alteração grava só o arquivo afetado.
   - A gravação usa createWritable(): o navegador escreve num arquivo temporário e só substitui
     o original ao final. Uma falha no meio não corrompe o arquivo.
   - Arquivo ilegível nunca é sobrescrito: a aplicação para e avisa.
   - Só uma aba pode editar por vez (Web Locks API).
   - Só um computador por vez: o arquivo sessao.json funciona como trava e é renovado
     a cada minuto. Uma sessão sem sinal há mais de 3 minutos é considerada encerrada.
   - Se a pasta parar de responder (rede fora do ar), as alterações ficam na memória
     e a gravação é tentada de novo a cada 30 segundos.

   Estados (App.storage.estado().estado):
     iniciando, sem-suporte, outra-aba, sem-pasta, aguardando, carregando, erro, em-uso,
     conectado, atencao, sem-permissao, falha-gravacao
*/
(function () {
  'use strict';

  const ARQUIVOS = [
    'config',
    'contas',
    'categorias',
    'lancamentos',
    'recorrencias',
    'cartoes',
    'compras_cartao',
    'faturas',
    'investimentos',
  ];
  const VERSAO_FORMATO = 1;

  const IDB_NOME = 'meufinanceiro';
  const IDB_LOJA = 'chaves';
  const CHAVE_PASTA = 'pastaDados';
  const NOME_TRAVA = 'meufinanceiro-edicao';

  const ARQ_SESSAO = 'sessao.json';
  const SINAL_MS = 60 * 1000;
  const SESSAO_EXPIRA_MS = 3 * 60 * 1000;
  const RETENTATIVA_MS = 30 * 1000;
  const ID_SESSAO = App.util.gerarId('ses');

  const st = {
    estado: 'iniciando',
    detalhe: '',
    pasta: null,
    handles: {},
    dados: {},
    duplicados: [],
    filas: {},
    pendentes: new Set(),
    carregado: false,
    travaObtida: false,
    ignorarOutraSessao: false,
    sessaoOutra: null,
    timerSinal: null,
    timerRetentativa: null,
  };

  class ErroDados extends Error {}

  function definirEstado(estado, detalhe) {
    st.estado = estado;
    st.detalhe = detalhe || '';
    App.eventos.emit('armazenamento:estado', { estado: st.estado, detalhe: st.detalhe });
  }

  /* ---------- IndexedDB (só guarda a referência da pasta) ---------- */

  function abrirIdb() {
    return new Promise(function (resolver, rejeitar) {
      const pedido = indexedDB.open(IDB_NOME, 1);
      pedido.onupgradeneeded = function () {
        pedido.result.createObjectStore(IDB_LOJA);
      };
      pedido.onsuccess = function () {
        resolver(pedido.result);
      };
      pedido.onerror = function () {
        rejeitar(pedido.error);
      };
    });
  }

  async function idbLer(chave) {
    const db = await abrirIdb();
    return new Promise(function (resolver, rejeitar) {
      const pedido = db.transaction(IDB_LOJA, 'readonly').objectStore(IDB_LOJA).get(chave);
      pedido.onsuccess = function () {
        resolver(pedido.result);
      };
      pedido.onerror = function () {
        rejeitar(pedido.error);
      };
    });
  }

  async function idbGravar(chave, valor) {
    const db = await abrirIdb();
    return new Promise(function (resolver, rejeitar) {
      const transacao = db.transaction(IDB_LOJA, 'readwrite');
      transacao.objectStore(IDB_LOJA).put(valor, chave);
      transacao.oncomplete = function () {
        resolver();
      };
      transacao.onerror = function () {
        rejeitar(transacao.error);
      };
    });
  }

  /* ---------- Uma aba por vez ---------- */

  function obterTrava() {
    if (st.travaObtida) return Promise.resolve(true);
    if (!navigator.locks) return Promise.resolve(true);
    return new Promise(function (resolver) {
      navigator.locks
        .request(NOME_TRAVA, { ifAvailable: true }, function (trava) {
          if (!trava) {
            resolver(false);
            return undefined;
          }
          st.travaObtida = true;
          resolver(true);
          // Mantém a trava enquanto a aba estiver aberta.
          return new Promise(function () {});
        })
        .catch(function (erro) {
          console.warn('Web Locks indisponível:', erro);
          resolver(true);
        });
    });
  }

  /* ---------- Conteúdo inicial dos arquivos ---------- */

  function categoriasIniciais() {
    const agora = App.util.agoraISO();
    const lista = [
      ['Salário', 'receita', '#1d4ed8'],
      ['Serviços e trabalhos extras', 'receita', '#0e7490'],
      ['Rendimentos de investimentos', 'receita', '#15803d'],
      ['Reembolsos', 'receita', '#7c3aed'],
      ['Outras receitas', 'receita', '#64748b'],
      ['Moradia', 'despesa', '#1d4ed8'],
      ['Alimentação', 'despesa', '#0e7490'],
      ['Transporte', 'despesa', '#b45309'],
      ['Saúde', 'despesa', '#be123c'],
      ['Educação', 'despesa', '#4338ca'],
      ['Lazer', 'despesa', '#7c3aed'],
      ['Assinaturas', 'despesa', '#0f766e'],
      ['Vestuário', 'despesa', '#c2410c'],
      ['Encargos de cartão', 'despesa', '#b91c1c'],
      ['Outras despesas', 'despesa', '#64748b'],
    ];
    return lista.map(function (item) {
      return {
        id: App.util.gerarId('cat'),
        nome: item[0],
        natureza: item[1],
        cor: item[2],
        criadoEm: agora,
        alteradoEm: agora,
      };
    });
  }

  function conteudoInicial(nome) {
    if (nome === 'config') {
      return {
        versao: VERSAO_FORMATO,
        criadoEm: App.util.agoraISO(),
        preferencias: { backupsMantidos: 30 },
      };
    }
    return {
      versao: VERSAO_FORMATO,
      registros: nome === 'categorias' ? categoriasIniciais() : [],
    };
  }

  function validarEstrutura(nome, obj) {
    const arquivo = nome + '.json';
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ErroDados('O arquivo ' + arquivo + ' não tem o formato esperado.');
    }
    if (!Number.isInteger(obj.versao)) {
      throw new ErroDados('O arquivo ' + arquivo + ' não informa a versão do formato.');
    }
    if (obj.versao > VERSAO_FORMATO) {
      throw new ErroDados(
        'O arquivo ' + arquivo + ' foi criado por uma versão mais nova do MeuFinanceiro. Atualize a aplicação antes de abri-lo.'
      );
    }
    if (nome !== 'config' && !Array.isArray(obj.registros)) {
      throw new ErroDados('O arquivo ' + arquivo + ' não tem a lista de registros.');
    }
  }

  /* ---------- Um computador por vez (sessao.json) ---------- */

  async function lerSessao() {
    try {
      const handle = await st.pasta.getFileHandle(ARQ_SESSAO);
      return JSON.parse(await (await handle.getFile()).text());
    } catch (erro) {
      return null; // não existe ou ilegível: não há trava válida
    }
  }

  // A sessão anterior deste mesmo computador (aba fechada sem tempo de registrar o
  // encerramento) não bloqueia: duas abas no mesmo navegador já são impedidas pela Web Locks API.
  function sessaoAtivaDeOutro(sessao) {
    if (!sessao || sessao.id === ID_SESSAO || sessao.encerrada) return false;
    if (st.idComputador && sessao.computador === st.idComputador) return false;
    const sinal = Date.parse(sessao.ultimoSinal);
    return Number.isFinite(sinal) && Date.now() - sinal < SESSAO_EXPIRA_MS;
  }

  async function registrarSessao(encerrada) {
    const handle = await st.pasta.getFileHandle(ARQ_SESSAO, { create: true });
    await gravarArquivo(handle, {
      id: ID_SESSAO,
      computador: st.idComputador,
      inicio: st.inicioSessao,
      ultimoSinal: App.util.agoraISO(),
      encerrada: !!encerrada,
      navegador: navigator.userAgent.slice(0, 120),
    });
  }

  function iniciarSinal() {
    clearInterval(st.timerSinal);
    st.timerSinal = setInterval(async function () {
      try {
        if ((await st.pasta.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
        const sessao = await lerSessao();
        if (sessaoAtivaDeOutro(sessao) && !st.avisouOutraSessao) {
          st.avisouOutraSessao = true;
          App.aviso.alerta(
            'Os dados foram abertos em outro computador. Para não perder alterações, feche o MeuFinanceiro em um dos dois.'
          );
        }
        await registrarSessao(false);
      } catch (erro) {
        console.warn('Não foi possível renovar a sessão:', erro);
      }
    }, SINAL_MS);
  }

  window.addEventListener('pagehide', function () {
    if (st.carregado && st.pasta) registrarSessao(true).catch(function () {});
  });

  /* ---------- Leitura e gravação ---------- */

  async function gravarArquivo(handle, obj) {
    return escreverTexto(handle, JSON.stringify(obj, null, 2) + '\n');
  }

  // Grava o texto no arquivo pelo mesmo caminho seguro: nada é trocado se a escrita falhar no meio.
  async function escreverTexto(handle, texto) {
    const escrita = await handle.createWritable();
    try {
      await escrita.write(texto);
      await escrita.close();
    } catch (erro) {
      try {
        await escrita.abort();
      } catch (e) {
        /* nada a fazer */
      }
      throw erro;
    }
  }

  async function procurarDuplicados() {
    const encontrados = [];
    for await (const [nome, handle] of st.pasta.entries()) {
      if (handle.kind === 'file' && /\s\(\d+\)\.json$/i.test(nome)) encontrados.push(nome);
    }
    return encontrados.sort();
  }

  async function carregar() {
    st.carregado = false;
    definirEstado('carregando', st.pasta.name);
    try {
      const outra = await lerSessao();
      if (sessaoAtivaDeOutro(outra) && !st.ignorarOutraSessao) {
        st.sessaoOutra = outra;
        definirEstado('em-uso', outra.ultimoSinal);
        return;
      }
      const dados = {};
      const handles = {};

      // Primeiro só olha o que existe, sem criar nada. Assim dá para distinguir "pasta nova"
      // (arquivos ausentes ou todos vazios) de "pasta em uso com um arquivo esvaziado por falha
      // externa, como a de um programa de sincronização".
      const lidos = {};
      for (const nome of ARQUIVOS) {
        try {
          const handle = await st.pasta.getFileHandle(nome + '.json');
          lidos[nome] = { existia: true, handle: handle, texto: await (await handle.getFile()).text() };
        } catch (e) {
          if (e.name !== 'NotFoundError') throw e;
          lidos[nome] = { existia: false, handle: null, texto: '' };
        }
      }
      const pastaEmUso = ARQUIVOS.some(function (n) {
        return lidos[n].texto.trim() !== '';
      });

      for (const nome of ARQUIVOS) {
        let handle = lidos[nome].handle;
        const texto = lidos[nome].texto;
        if (texto.trim() === '') {
          if (lidos[nome].existia && pastaEmUso) {
            throw new ErroDados(
              'O arquivo ' + nome + '.json existe, mas está vazio (0 bytes). Isso pode acontecer quando um programa de sincronização falha. ' +
                'Ele não foi alterado. Copie o arquivo ' + nome + '.json de uma cópia da pasta backups (ou restaure o backup exportado) e tente de novo.'
            );
          }
          handle = handle || (await st.pasta.getFileHandle(nome + '.json', { create: true }));
          handles[nome] = handle;
          dados[nome] = conteudoInicial(nome);
          await gravarArquivo(handle, dados[nome]);
          continue;
        }
        handles[nome] = handle;
        let obj;
        try {
          obj = JSON.parse(texto);
        } catch (e) {
          throw new ErroDados(
            'O arquivo ' + nome + '.json está danificado e não pôde ser lido. Ele não foi alterado. ' +
              'Restaure uma cópia da pasta backups e tente de novo.'
          );
        }
        validarEstrutura(nome, obj);
        dados[nome] = obj;
      }
      st.dados = dados;
      st.handles = handles;
      st.pendentes.clear();
      st.duplicados = await procurarDuplicados();
      st.inicioSessao = App.util.agoraISO();
      try {
        await registrarSessao(false);
      } catch (erro) {
        console.warn('Não foi possível registrar a sessão:', erro);
      }
      iniciarSinal();
      st.carregado = true;
      definirEstado(st.duplicados.length ? 'atencao' : 'conectado', st.pasta.name);
      App.eventos.emit('armazenamento:carregado');
    } catch (erro) {
      console.error(erro);
      const mensagem =
        erro instanceof ErroDados
          ? erro.message
          : 'Não foi possível acessar a pasta "' + st.pasta.name + '". Se ela fica na rede, confira se este computador está conectado à rede e se a pasta continua disponível, e clique em "Tentar de novo". (Detalhe técnico: ' + erro.message + ')';
      definirEstado('erro', mensagem);
    }
  }

  /* ---------- Ações públicas ---------- */

  function suportado() {
    return typeof window.showDirectoryPicker === 'function';
  }

  async function iniciar() {
    if (!suportado()) {
      definirEstado('sem-suporte');
      return;
    }
    if (!(await obterTrava())) {
      definirEstado('outra-aba');
      return;
    }
    try {
      st.idComputador = await idbLer('idComputador');
      if (!st.idComputador) {
        st.idComputador = App.util.gerarId('pc');
        await idbGravar('idComputador', st.idComputador);
      }
    } catch (erro) {
      console.warn('Não foi possível identificar este computador:', erro);
    }
    let pasta = null;
    try {
      pasta = await idbLer(CHAVE_PASTA);
    } catch (erro) {
      console.warn('Não foi possível ler a pasta guardada:', erro);
    }
    if (!pasta) {
      definirEstado('sem-pasta');
      return;
    }
    st.pasta = pasta;
    const permissao = await pasta.queryPermission({ mode: 'readwrite' });
    if (permissao === 'granted') {
      await carregar();
    } else {
      definirEstado('aguardando', pasta.name);
    }
  }

  // Precisa ser chamada a partir de um clique do usuário.
  async function escolherPasta() {
    let pasta;
    try {
      pasta = await window.showDirectoryPicker({ id: 'meufinanceiro-dados', mode: 'readwrite' });
    } catch (erro) {
      if (erro.name === 'AbortError') {
        // O Chrome também devolve AbortError quando recusa uma pasta protegida
        // (Downloads, Documentos, Área de Trabalho, raiz de disco...). Sem este aviso, parece que nada aconteceu.
        App.aviso.alerta(
          'Nenhuma pasta foi conectada. Se você escolheu uma pasta e o Chrome a recusou, crie uma subpasta nova (por exemplo, MeuFinanceiro-dados dentro de Documentos) e escolha essa. O Chrome não aceita pastas protegidas como Downloads, Documentos, Área de Trabalho ou a raiz de um disco. (Detalhe técnico: ' + erro.name + ' – ' + erro.message + ' | endereço: ' + location.protocol + '//' + location.pathname.slice(0, 40) + ' | navegador: ' + navigator.userAgent.slice(0, 80) + ')'
        );
        console.warn('showDirectoryPicker falhou:', erro);
        return false;
      }
      throw erro;
    }

    // Proteção contra escolher, por engano, uma pasta com outros arquivos.
    const nomesEsperados = ARQUIVOS.map(function (n) {
      return n + '.json';
    });
    let temArquivosNossos = false;
    let temOutrosItens = false;
    for await (const [nome] of pasta.entries()) {
      if (nomesEsperados.includes(nome) || nome === 'backups' || nome === ARQ_SESSAO) temArquivosNossos = true;
      else if (!nome.startsWith('.')) temOutrosItens = true;
    }
    if (temOutrosItens && !temArquivosNossos) {
      const continuar = window.confirm(
        'A pasta "' + pasta.name + '" já tem outros arquivos. O recomendado é usar uma pasta só para o MeuFinanceiro.\n\nUsar esta pasta mesmo assim?'
      );
      if (!continuar) return false;
    }

    const permissao = await pasta.requestPermission({ mode: 'readwrite' });
    if (permissao !== 'granted') {
      App.aviso.erro('Sem permissão de gravação, o MeuFinanceiro não consegue salvar seus dados nessa pasta.');
      return false;
    }
    await idbGravar(CHAVE_PASTA, pasta);
    st.pasta = pasta;
    st.ignorarOutraSessao = false;
    await carregar();
    return true;
  }

  // Precisa ser chamada a partir de um clique do usuário.
  async function reautorizar() {
    if (!st.pasta) return false;
    const permissao = await st.pasta.requestPermission({ mode: 'readwrite' });
    if (permissao !== 'granted') {
      App.aviso.erro('A pasta continua sem autorização. Clique de novo e escolha "Permitir".');
      return false;
    }
    if (!st.carregado) {
      await carregar();
      return true;
    }
    // Já estava em uso: grava o que ficou pendente.
    definirEstado(estadoNormal(), st.pasta.name);
    await tentarPendentes(false);
    return true;
  }

  function estadoNormal() {
    return st.duplicados.length ? 'atencao' : 'conectado';
  }

  async function abrirMesmoAssim() {
    st.ignorarOutraSessao = true;
    if ((await st.pasta.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      const permissao = await st.pasta.requestPermission({ mode: 'readwrite' });
      if (permissao !== 'granted') return false;
    }
    await carregar();
    return true;
  }

  // Tenta gravar de novo os arquivos que falharam (rede fora do ar, por exemplo).
  async function tentarPendentes(silencioso) {
    const nomes = Array.from(st.pendentes);
    if (!nomes.length) return true;
    let todosOk = true;
    for (const nome of nomes) {
      try {
        await salvarInterno(nome, true);
      } catch (erro) {
        todosOk = false;
      }
    }
    if (todosOk && !silencioso) App.aviso.sucesso('Alterações pendentes salvas.');
    if (todosOk && silencioso) App.aviso.sucesso('A pasta de dados voltou a responder. Alterações salvas.');
    if (!todosOk && !silencioso) App.aviso.erro('A pasta de dados ainda não responde. Nova tentativa em 30 segundos.');
    return todosOk;
  }

  function agendarRetentativa() {
    if (st.timerRetentativa) return;
    st.timerRetentativa = setInterval(async function () {
      if (!st.pendentes.size || st.estado === 'sem-permissao') {
        if (!st.pendentes.size) {
          clearInterval(st.timerRetentativa);
          st.timerRetentativa = null;
        }
        return;
      }
      await tentarPendentes(true);
    }, RETENTATIVA_MS);
  }

  // Avisa antes de fechar a página se houver alteração não gravada.
  window.addEventListener('beforeunload', function (evento) {
    if (st.pendentes.size) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  });

  async function procurarDuplicadosDeNovo() {
    if (!st.pasta || !st.carregado) return [];
    st.duplicados = await procurarDuplicados();
    if (st.estado === 'conectado' || st.estado === 'atencao') {
      definirEstado(estadoNormal(), st.pasta.name);
    }
    return st.duplicados;
  }

  // Grava um arquivo inteiro a partir dos dados em memória. As gravações do mesmo arquivo
  // entram numa fila, para nunca acontecerem ao mesmo tempo.
  function salvarInterno(nome, silencioso) {
    if (!st.handles[nome]) return Promise.reject(new Error('Arquivo desconhecido: ' + nome));
    const anterior = st.filas[nome] || Promise.resolve();
    const atual = anterior
      .catch(function () {})
      .then(async function () {
        let permissao;
        try {
          permissao = await st.pasta.queryPermission({ mode: 'readwrite' });
        } catch (erro) {
          permissao = 'granted'; // deixa a gravação revelar o problema real
        }
        if (permissao !== 'granted') {
          st.pendentes.add(nome);
          definirEstado('sem-permissao', st.pasta.name);
          throw new Error('A autorização da pasta expirou. Clique em "Reautorizar pasta" no topo da tela; as alterações serão salvas em seguida.');
        }
        try {
          await gravarArquivo(st.handles[nome], st.dados[nome]);
        } catch (erro) {
          console.error(erro);
          st.pendentes.add(nome);
          definirEstado('falha-gravacao', st.pasta.name);
          agendarRetentativa();
          throw new Error(
            'A pasta de dados não respondeu. Se ela fica na rede, confira a conexão. A alteração está guardada nesta página e será gravada assim que a pasta voltar; não feche o MeuFinanceiro até lá.'
          );
        }
        st.pendentes.delete(nome);
        if (!st.pendentes.size && (st.estado === 'falha-gravacao' || st.estado === 'sem-permissao')) {
          definirEstado(estadoNormal(), st.pasta.name);
        }
        App.eventos.emit('armazenamento:salvo', nome);
      });
    st.filas[nome] = atual;
    return atual.catch(function (erro) {
      if (!silencioso) App.aviso.erro('Não foi possível salvar ' + nome + '.json. ' + erro.message);
      throw erro;
    });
  }

  function salvar(nome) {
    return salvarInterno(nome, false);
  }

  // Usada na restauração de backup (RF-40): troca todos os dados em memória pelos do conjunto
  // e grava cada arquivo. O conjunto precisa ter sido conferido antes (ver nucleo/backup.js).
  // Devolve { falhas: [nomes dos arquivos que não foram gravados] }; o que falhar fica pendente
  // e é gravado de novo pelo mecanismo normal de retentativa.
  async function substituirDados(conjunto) {
    ARQUIVOS.forEach(function (nome) {
      validarEstrutura(nome, conjunto[nome]);
    });
    ARQUIVOS.forEach(function (nome) {
      st.dados[nome] = conjunto[nome];
    });
    const falhas = [];
    for (const nome of ARQUIVOS) {
      try {
        await salvarInterno(nome, true);
      } catch (erro) {
        falhas.push(nome);
      }
    }
    return { falhas: falhas };
  }

  App.storage = {
    ARQUIVOS: ARQUIVOS.slice(),
    VERSAO_FORMATO: VERSAO_FORMATO,
    escreverTexto: escreverTexto,
    substituirDados: substituirDados,
    pasta: function () {
      return st.pasta;
    },
    suportado: suportado,
    iniciar: iniciar,
    escolherPasta: escolherPasta,
    reautorizar: reautorizar,
    salvar: salvar,
    tentarPendentes: tentarPendentes,
    abrirMesmoAssim: abrirMesmoAssim,
    procurarDuplicados: procurarDuplicadosDeNovo,
    carregado: function () {
      return st.carregado;
    },
    obter: function (nome) {
      return st.dados[nome];
    },
    estado: function () {
      return {
        estado: st.estado,
        detalhe: st.detalhe,
        pasta: st.pasta ? st.pasta.name : '',
        duplicados: st.duplicados.slice(),
        pendentes: Array.from(st.pendentes),
        sessaoOutra: st.sessaoOutra,
      };
    },
  };
})();
