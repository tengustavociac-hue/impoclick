/**
 * Banco de Dados Local de NCMs e Alíquotas de Importação
 * Baseado na Tarifa Externa Comum (TEC) e Tabela de Incidência do IPI (TIPI) da Receita Federal.
 */
const NCM_DATABASE = {
    // --- ELETRÔNICOS E COMPUTAÇÃO (Capítulo 84 e 85) ---
    "84713012": { name: "Notebooks / Computadores portáteis com peso inferior a 10kg", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84713019": { name: "Outros computadores portáteis", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84715010": { name: "Computadores de mesa (CPUs/Unidades de processamento digital)", ii: 12, ipi: 15, pis: 2.1, cofins: 9.65 },
    "85235190": { name: "Dispositivos de armazenamento semicondutor não volátil (SSDs, pendrives, cartões SD)", ii: 8, ipi: 0, pis: 2.1, cofins: 9.65 },
    "85171300": { name: "Telefones celulares (Smartphones)", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    "85176277": { name: "Roteadores digitais para redes sem fio ou cabeadas", ii: 12, ipi: 12, pis: 2.1, cofins: 9.65 },
    "85176272": { name: "Modems para transmissão de dados", ii: 12, ipi: 12, pis: 2.1, cofins: 9.65 },
    "85285220": { name: "Monitores de vídeo coloridos (para computadores)", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84716053": { name: "Teclados para computadores", ii: 12, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84716054": { name: "Mouses / Unidades de entrada de coordenadas", ii: 12, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84717010": { name: "Discos rígidos (HDs) magnéticos", ii: 8, ipi: 0, pis: 2.1, cofins: 9.65 },
    "85044040": { name: "Carregadores de acumuladores (fontes de alimentação)", ii: 14, ipi: 10, pis: 2.1, cofins: 9.65 },
    
    // --- VESTUÁRIO, TÊXTEIS E CALÇADOS (Capítulos 61, 62, 64) ---
    "61091000": { name: "Camisetas (T-shirts) de malha, de algodão", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "61099000": { name: "Camisetas (T-shirts) de outras matérias têxteis", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "62034200": { name: "Calças, jardineiras, calças curtas de algodão masculinas", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "62046200": { name: "Calças, jardineiras, calças curtas de algodão femininas", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "64039990": { name: "Outros calçados de couro natural com sola de borracha", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "64041100": { name: "Calçados de esporte (tênis para corrida, basquete, etc.)", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "65050099": { name: "Bonés, gorros e chapéus (Têxteis)", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    "42022100": { name: "Bolsas com a superfície externa de couro natural", ii: 35, ipi: 0, pis: 2.1, cofins: 9.65 },
    
    // --- BRINQUEDOS, JOGOS E ESPORTE (Capítulo 95) ---
    "95030099": { name: "Brinquedos e jogos infantis em geral (bonecas, carrinhos, etc.)", ii: 20, ipi: 10, pis: 2.1, cofins: 9.65 },
    "95045000": { name: "Consoles e máquinas de videojogos (Videogames)", ii: 20, ipi: 0, pis: 2.1, cofins: 9.65 },
    "87120010": { name: "Bicicletas de duas rodas (comuns)", ii: 35, ipi: 10, pis: 2.1, cofins: 9.65 },
    "95066200": { name: "Bolas infláveis para esportes (futebol, basquete, etc.)", ii: 18, ipi: 10, pis: 2.1, cofins: 9.65 },
    
    // --- COSMÉTICOS E BELEZA (Capítulo 33) ---
    "33030010": { name: "Perfumes (extratos líquido-alcoólicos)", ii: 18, ipi: 42, pis: 2.1, cofins: 9.65 },
    "33049990": { name: "Produtos de beleza ou maquiagem e cremes para a pele", ii: 18, ipi: 22, pis: 2.1, cofins: 9.65 },
    "33051000": { name: "Xampus para os cabelos", ii: 18, ipi: 15, pis: 2.1, cofins: 9.65 },
    
    // --- CASA, COZINHA E UTILIDADES (Capítulos 39, 70, 73, 94) ---
    "39241000": { name: "Louça, outros artigos de mesa e utensílios de plástico para cozinha", ii: 18, ipi: 10, pis: 2.1, cofins: 9.65 },
    "70133700": { name: "Copos de vidro (exceto de vitrocerâmica)", ii: 18, ipi: 10, pis: 2.1, cofins: 9.65 },
    "73239300": { name: "Utensílios de mesa/cozinha de aço inoxidável (panelas, talheres)", ii: 20, ipi: 10, pis: 2.1, cofins: 9.65 },
    "94036000": { name: "Móveis de madeira (para salas, quartos, escritórios)", ii: 18, ipi: 10, pis: 2.1, cofins: 9.65 },
    
    // --- RELÓGIOS E ÓCULOS (Capítulos 90, 91) ---
    "91021110": { name: "Relógios de pulso, mecânicos", ii: 20, ipi: 15, pis: 2.1, cofins: 9.65 },
    "91021220": { name: "Relógios de pulso optoeletrônicos (Smartwatches/relógios digitais)", ii: 20, ipi: 15, pis: 2.1, cofins: 9.65 },
    "90041000": { name: "Óculos de sol", ii: 20, ipi: 15, pis: 2.1, cofins: 9.65 },
    
    // --- ALIMENTOS E SUPLEMENTOS (Capítulos 21, 22) ---
    "21069030": { name: "Complementos alimentares (Suplementos vitamínicos, whey protein, etc.)", ii: 16, ipi: 0, pis: 2.1, cofins: 9.65 },
    "22042100": { name: "Vinhos de uvas frescas em garrafas de capacidade <= 2 litros", ii: 20, ipi: 10, pis: 2.1, cofins: 9.65 },
    
    // --- FERRAMENTAS E ELÉTRICOS (Capítulo 84, 85) ---
    "85081100": { name: "Aspiradores de pó com motor elétrico (potência <= 1500W)", ii: 20, ipi: 15, pis: 2.1, cofins: 9.65 },
    "85167100": { name: "Aparelhos para preparação de café ou de chá (Cafeteiras)", ii: 20, ipi: 15, pis: 2.1, cofins: 9.65 },
    "84672100": { name: "Furadeiras manuais com motor elétrico incorporado", ii: 14, ipi: 10, pis: 2.1, cofins: 9.65 },
    
    // --- ACESSÓRIOS AUTOMOTIVOS (Capítulo 40, 85) ---
    "40111000": { name: "Pneus novos de borracha para automóveis de passageiros", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    "85071010": { name: "Acumuladores elétricos de chumbo-ácido (Baterias de partida)", ii: 16, ipi: 15, pis: 2.1, cofins: 9.65 },
    
    // --- LIVROS E IMPRESSOS (ISENÇÃO CONSTITUCIONAL) ---
    "49019900": { name: "Livros, brochuras e impressos semelhantes (Imunes de Impostos)", ii: 0, ipi: 0, pis: 0, cofins: 0 }
};

/**
 * Função para buscar as alíquotas de um NCM de forma limpa.
 * Remove pontos, traços ou espaços e faz a busca.
 */
function lookupLocalNcm(ncmCode) {
    if (!ncmCode) return null;
    const cleanCode = ncmCode.toString().replace(/[^0-9]/g, '');
    return NCM_DATABASE[cleanCode] || null;
}
