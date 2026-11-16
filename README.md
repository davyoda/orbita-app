# Órbita

App de estudos com o Claude: matérias como galáxias, temas como planetas e subtópicos em órbita. Aulas, leituras, vídeos e gravações entram como fontes, e o Claude resume cada uma e coloca no lugar certo do mapa.

Um mesmo código gera duas coisas:
- **App web instalável**, que funciona em iPhone, Android e computador. No iPhone: abrir no Safari → Compartilhar → "Adicionar à Tela de Início".
- **APK para Android**, gerado automaticamente pelo GitHub a cada mudança.

## Como funciona por dentro

| Parte | Onde fica | O que faz |
|---|---|---|
| `web/` | Vercel (site) e APK | O app. `claude-shim.js` faz a ponte com o servidor. |
| `supabase/migrations` | Supabase | Tabela `docs` com regras de acesso: cada conta só enxerga os próprios dados. |
| `supabase/functions/claude` | Supabase | Ponte com a API do Claude. A chave fica só aqui. |
| `supabase/functions/transcribe` | Supabase | Transcrição de áudio com o Whisper, pelo Groq (plano gratuito). |
| `.github/workflows` | GitHub Actions | Publica o servidor e monta o APK. |

O modelo do Claude é escolhido no servidor, e não no app:
- `MODEL_QUICK` (padrão `claude-haiku-5-5`): tarefas rápidas, como detectar o tema de uma aula ao vivo.
- `MODEL_DEFAULT` (padrão `claude-sonnet-5-5`): todo o resto.

Para trocar o modelo, crie esses segredos no Supabase (Edge Functions → Secrets). Não precisa atualizar o app.

## Configuração (uma vez só)

### 1. Supabase
- **Authentication → Sign In / Providers → Email:** desligue **Confirm email**. Assim a conta já funciona assim que é criada.
- Anote três coisas:
  - a **Project URL**;
  - o código do projeto, que é o trecho antes de `.supabase.co` na Project URL;
  - a **senha do banco**, criada junto com o projeto. Se esqueceu, troque em Database → Settings.
- Crie um token de acesso em https://supabase.com/dashboard/account/tokens.

### 2. Segredos no GitHub
No repositório, vá em **Settings → Secrets and variables → Actions → New repository secret** e crie:

| Nome | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | o token do passo 1 |
| `SUPABASE_PROJECT_REF` | o código do projeto |
| `SUPABASE_DB_PASSWORD` | a senha do banco |
| `ANTHROPIC_API_KEY` | a chave gerada em platform.claude.com → API keys |
| `GROQ_API_KEY` | a chave gerada em console.groq.com → API Keys |
| `ALLOWED_EMAILS` | os e-mails que podem usar o Claude, separados por vírgula |

Só os e-mails de `ALLOWED_EMAILS` gastam créditos da API. Qualquer outra pessoa que crie uma conta só vê um espaço vazio, sem IA.

### 3. Publicar o servidor
Em **Actions → Servidor (Supabase) → Run workflow**. Depois disso, ele roda sozinho sempre que algo em `supabase/` mudar.

### 4. Publicar o site
Em https://vercel.com → **Add New → Project**:
1. Importe o `orbita-app`.
2. Em **Root Directory**, escolha `web`.
3. Em **Framework**, escolha *Other*.
4. Clique em **Deploy**.

O endereço que aparecer é o do app.

### 5. APK
Ele é montado sozinho em **Actions → APK Android** e publicado em **Releases**. No Android:
1. Baixe o `.apk`.
2. Abra o arquivo e permita a instalação de fontes desconhecidas.

## Limites conhecidos
- **Versão web no iPhone:** o "Iniciar aula" grava só com o app aberto na tela. O app mantém a tela acesa durante a gravação.
- **Transcrição gratuita (Groq):** até 2 horas de áudio por hora e 8 horas por dia.
- **Vídeos acima de 15 MB:** o áudio é ouvido em silêncio, 1,5x mais rápido. Um vídeo de 1 hora leva uns 40 minutos para ser transcrito.
- **Granola:** desligado fora do claude.ai. A API dele só existe nos planos pagos do Granola.

## Testar no computador
```
npm run serve
```
Depois abra http://localhost:8080. Para o login e o Claude funcionarem, preencha `web/config.js` antes.
