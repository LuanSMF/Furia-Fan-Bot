create database db_furiafan;

use db_furiafan;

CREATE TABLE tb_usuario(
  id_usuario BIGINT not null,
  nm_usuario varchar(50),
  ds_email varchar(100),
  ds_cadastro_step varchar(50) default null,
  primary key (id_usuario)
);

create table tb_jogos(
	id_jogos int not null auto_increment,
    nm_jogos varchar(50),
	primary key (id_jogos)
);

create table tb_jogo_usuario(
	id_jogo_usuario int not null auto_increment,
    id_usuario BIGINT not null,
    id_jogos int not  null,
    primary key (id_jogo_usuario),
    foreign key(id_usuario) references tb_usuario(id_usuario),
	foreign key(id_jogos) references tb_jogos(id_jogos)
);

CREATE TABLE tb_teams (
  id_teams int not null auto_increment,
  nm_name varchar(50),
  primary key (id_teams)
);

CREATE TABLE tb_tournaments (
  id_tournaments int not null auto_increment,
  nm_name varchar(50),
  primary key (id_tournaments)
);

create table tb_multivalorado(
	id_multivalorado int not null auto_increment,
    id_teams int not null,
    id_tournaments int not null,
    primary key (id_multivalorado),
    foreign key(id_tournaments) references tb_tournaments(id_tournaments),
	foreign key(id_teams) references tb_teams(id_teams)
);

CREATE TABLE tb_formatos (
  id_formato INT NOT NULL AUTO_INCREMENT,
  nm_formato VARCHAR(10) NOT NULL UNIQUE, -- Ex: 'MD1', 'MD3', 'MD5'
  PRIMARY KEY (id_formato)
);

create table tb_status(
	id_status int not null auto_increment,
    nm_status varchar(10) not null unique,
    primary key (id_status)
);

CREATE TABLE tb_matches (
	id_matches int not null auto_increment,
    id_multivalorado int not null,
    id_formato int,
    id_status int,
    dt_match date not null,
    dt_time time not  null,
    nm_resultf TINYINT,
    nm_resultop TINYINT,
    nm_mvp TINYINT,
    nm_resultado_mvp real,
    bl_tempo boolean,
    primary key(id_matches),
		foreign key(id_multivalorado) references tb_multivalorado(id_multivalorado),
        foreign key(id_formato) references tb_formatos(id_formato),
         foreign key(id_status) references tb_status(id_status)
);


INSERT INTO tb_formatos (nm_formato) VALUES ('MD1'), ('MD3'), ('MD5');
INSERT INTO tb_status (nm_status)VALUES ('agendado'), ('ao_vivo'), ('finalizado');

SELECT CURDATE(), CURTIME();

SELECT id_matches, dt_match, dt_time, id_status FROM tb_matches WHERE dt_match = CURDATE();

select * from tb_usuario;

SELECT id_status FROM tb_status WHERE nm_status = 'ao_vivo';

SELECT *
FROM tb_matches
WHERE (
    id_matches IS NOT NULL OR
    id_multivalorado IS NOT NULL OR
    id_formato IS NOT NULL OR
    id_status IS NOT NULL OR
    dt_match IS NOT NULL OR
    dt_time IS NOT NULL
);

UPDATE tb_matches SET id_formato = 3 WHERE id_matches =1;

UPDATE tb_matches
SET id_status = 2
WHERE id_matches = 1;

SELECT id_matches, dt_match, dt_time, id_status FROM tb_matches WHERE dt_match = CURDATE() AND bl_tempo = true;

SELECT 
  id_matches, dt_match, dt_time, id_status,id_formato,
  CURDATE() AS hoje, CURTIME() AS agora
FROM tb_matches;

INSERT INTO tb_jogos (id_jogos, nm_jogos) VALUES
(1, 'Counter-Strike 2'),
(2, 'Valorant'),
(3, 'League of Legends'),
(4, 'Apex Legends'),
(5, 'Rainbow Six Siege'),
(6, 'Rocket League'),
(7, 'Kings League'),
(8, 'PUBG');



INSERT INTO tb_teams (nm_name) VALUES
('Heroic'),
('G2 Esports'),
('Vitality'),
('FaZe Clan'),
('Natus Vincere'),
('MOUZ'),
('Complexity'),
('Cloud9'),
('Team Spirit'),
('Virtus.pro'),
('Astralis'),
('Monte'),
('paiN Gaming'),
('Imperial Esports'),
('MIBR');



INSERT INTO tb_tournaments (nm_name) 
values
('ESL Pro League'),
('BLAST Premier'),
('IEM'),
('PGL Major'),
('CCT Online'),
('Outros Torneios');