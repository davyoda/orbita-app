/* Órbita · endereços públicos do servidor (Supabase).
 * Estes dois valores são públicos por natureza: o acesso aos dados é protegido
 * pelo login e pelas regras da base. As chaves secretas ficam só no servidor. */
window.ORBITA_CONFIG = {
  supabaseUrl: "COLE_AQUI_A_PROJECT_URL",
  supabaseAnonKey: "COLE_AQUI_A_ANON_KEY"
};
if (/COLE_AQUI/.test(window.ORBITA_CONFIG.supabaseUrl)) window.ORBITA_CONFIG = {};
