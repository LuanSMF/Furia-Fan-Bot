# 🐆🖤 Furia Fan Bot

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

Bot de Telegram criado por um admirador da FURIA Esports. Desenvolvido especialmente para o desafio técnico da equipe de esports da Furia. Ele permite a administração de confrontos, torneios e times, com comandos acessíveis via botões interativos e integração com banco de dados MySQL.

---

## 🚀 Funcionalidades

- 📅 Exibe agenda atualizada dos próximos jogos da FURIA, sendo possível filtrar por data e por campeonato
- 🔴 Transmissão de eventos ao vivo (texto, imagem ou vídeo) para usuários comuns sem acesso ao painel admin.
- 👤 Menu exclusivo para admins gerenciarem placar, resultado e eventos durante partidas ao vivo.
- 📖 Ao final das partidas ao vivo, é criado um espaço para visualizar um resumo ou rever a partida que já ocorreu.
- 🎮 Gerencia partidas, campeonatos e times com comandos administrativos, sendo possível realizar todas as operações do CRUD
- 🔐 Sistema de autenticação por ID de administrador
- 🗃️ Integração com banco de dados MySQL
- ✅ Interface modular com comandos separados
- 🛒 Botão que redireciona para a loja da Furia.
- 📚 Sistema de cadastro com verificação por e-mail e seleção de jogos favoritos
- 📨 Verificação de e-mail por código
- 🏆 Interface para MVP e resultados finais
   
---

## 🧰 Tecnologias Utilizadas

- [Node.js](https://nodejs.org/en/download/) – Ambiente de execução JavaScript no back-end
- [Telegraf](https://github.com/telegraf/telegraf) – biblioteca para criação de bots no Telegram
- [MongoDB](https://www.mongodb.com/products/tools/compass) - Banco NoSQL utilizado para sessões ao vivo
- [MySQL Workbench](https://dev.mysql.com/downloads/workbench/) – Banco de dados relacional utilizado para armazenar as informações
- [nodemailer](https://nodemailer.com/) - Envio de e-mails com código de verificação
- [mysql2](https://www.npmjs.com/package/mysql2) – driver MySQL com suporte a Promises
- [dotenv](https://www.npmjs.com/package/dotenv) – Gerenciamento de variáveis de ambiente
- [npm](https://www.npmjs.com/) – gerenciador de pacotes do Node.js 

---

## ⚙️ Pré-requisitos

Antes de iniciar, verifique se você atendeu aos seguintes requisitos:

- ✅ [Node.js 18+](https://nodejs.org/)
- ✅ [MySQL 8+](https://dev.mysql.com/downloads/mysql/8.0.html)
- ✅ [MongoDB Compass](https://www.mongodb.com/products/tools/compass)
- ✅ [Git](https://git-scm.com/downloads)
---

## 💻 Como Rodar Localmente

1. Abra o CMD e escolha o diretório desejado com o comando:"
   
```bash
   cd diretorio
   ```

1.2 Clone O Repositório :

```bash
git clone https://github.com/LuanSMF/Furia-Fan-Bot.git
```

2. No terminal, execute:
```bash
cd diretorio onde se encontra o projeto ex: C:\Users\luan\Documento\Furia-Fan-Bot
npm install
```

3.  Execute o script `furia_fanbot.sql` para criar o banco de dados `db_furiafan`, o script se encontra dentro da pasta banco

4. Abra seu MongoDB de preferência o Compass

5. Crie um arquivo .env ao lado do index.js

6.  Coloque sua  uri local do seu mongo:
```bash
mongo_uri=sua_conexao
```

7.  Coloque sua  Configuração  do seu MySql:
```bash 
# Configuração do banco de dados
DB_HOST=seu_host_do_banco_de_dados(ex:localhost)
DB_USER=seu_usuario_do_banco_de_dados(ex:root)
DB_PASSWORD=sua_senha_do_banco_de_dados(ex:123456)
DB_NAME=db_furiafan
DB_PORT=sua_porta(3306 ou 3307,verificar na configuração do seu banco)
```

8. Abra o arquivo config.js em admin/config.js e altere o ID do admin:

```
        ADMIN_USER_IDS: [
        seu_id_do_telegram,
        ],
```

9.Acesse  o [Gmail](https://myaccount.google.com/security) e ative a verificação em 2 etapas, depois vá para [Senhas de App](https://myaccount.google.com/apppasswords)

10.Dê um nome, crie o e-mail de envio, copie a chave e insira no arquivo .env da seguinte forma:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=seu_email
EMAIL_PASS=sua_chave
```
11. Inicie o bot:

```bash
node index.js
```

---

> ⚠️ **Atenção:** Nunca envie o arquivo `.env` para o GitHub.  
> Ele já está protegido via `.gitignore` para manter seus dados seguros.

---

## 💡 Possíveis Melhorias Futuras

- Implementar busca de produtos da loja da FURIA no bot
- Implementar curiosidades vinculadas ao banco de dados.
- Exibir estatísticas individuais de todos os jogadores

---

## 📝 Licença

Este projeto está licenciado sob a Licença MIT. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

Desenvolvido por [@LuanSMF](https://github.com/LuanSMF)  
Projeto desenvolvido como parte do desafio técnico para a vaga de Assistente de Engenharia de Software.



