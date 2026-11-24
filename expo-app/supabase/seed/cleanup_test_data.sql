-- Go4Pro: entfernt alle Testdaten aus test_data.sql (is_test = true) vollständig.
-- Echte Spieler, die einem Test-Team beigetreten sind, behalten ihre Einträge; nur die Test-Mitgliedschaft
-- und der Verweis auf Test-Verein/-Team verschwinden.

begin;

create temp table t_clubs on commit drop as select id from clubs where is_test;
create temp table t_teams on commit drop as select id from teams where is_test or club_id in (select id from t_clubs);
create temp table t_players on commit drop as select id from players where is_test;
create temp table t_profiles on commit drop as select id from profiles where is_test;

alter table exercise_entries disable trigger user;
alter table diary_entries disable trigger user;
alter table team_members disable trigger user;
alter table team_staff disable trigger user;
alter table player_club_history disable trigger user;
alter table challenge_claims disable trigger user;
alter table challenge_participants disable trigger user;
alter table challenges disable trigger user;
alter table club_licenses disable trigger user;
alter table club_memberships disable trigger user;
alter table matches disable trigger user;
alter table match_appearances disable trigger user;
alter table teams disable trigger user;
alter table players disable trigger user;
alter table clubs disable trigger user;
alter table profiles disable trigger user;
alter table news disable trigger user;
alter table ads disable trigger user;

-- Einträge echter Spieler behalten, nur den Verweis lösen
update exercise_entries set team_id = null, club_id = null
 where player_id not in (select id from t_players) and (team_id in (select id from t_teams) or club_id in (select id from t_clubs));
update diary_entries set team_id = null, club_id = null
 where player_id not in (select id from t_players) and (team_id in (select id from t_teams) or club_id in (select id from t_clubs));

delete from news where is_test or team_id in (select id from t_teams) or club_id in (select id from t_clubs);
delete from ads where is_test or club_id in (select id from t_clubs);
delete from exercise_entries where player_id in (select id from t_players);
delete from diary_entries where player_id in (select id from t_players);
delete from challenge_claims where player_id in (select id from t_players);
delete from challenge_participants where player_id in (select id from t_players)
   or challenge_id in (select id from challenges where team_id in (select id from t_teams) or club_id in (select id from t_clubs));
delete from challenges where team_id in (select id from t_teams) or club_id in (select id from t_clubs);
delete from match_appearances where player_id in (select id from t_players)
   or match_id in (select id from matches where club_id in (select id from t_clubs) or team_id in (select id from t_teams));
delete from matches where club_id in (select id from t_clubs) or team_id in (select id from t_teams);
update matches set opponent_club_id = null where opponent_club_id in (select id from t_clubs);
delete from subscriptions where player_id in (select id from t_players);
delete from team_members where team_id in (select id from t_teams) or player_id in (select id from t_players);
delete from team_staff where team_id in (select id from t_teams);
delete from player_club_history where club_id in (select id from t_clubs) or player_id in (select id from t_players);
delete from club_licenses where club_id in (select id from t_clubs);
delete from club_memberships where club_id in (select id from t_clubs);
delete from teams where id in (select id from t_teams);
delete from players where id in (select id from t_players);
delete from clubs where id in (select id from t_clubs);
delete from audit_log where actor in (select id from t_profiles);
delete from profiles where id in (select id from t_profiles);
delete from auth.users where id in (select id from t_profiles);

alter table exercise_entries enable trigger user;
alter table diary_entries enable trigger user;
alter table team_members enable trigger user;
alter table team_staff enable trigger user;
alter table player_club_history enable trigger user;
alter table challenge_claims enable trigger user;
alter table challenge_participants enable trigger user;
alter table challenges enable trigger user;
alter table club_licenses enable trigger user;
alter table club_memberships enable trigger user;
alter table matches enable trigger user;
alter table match_appearances enable trigger user;
alter table teams enable trigger user;
alter table players enable trigger user;
alter table clubs enable trigger user;
alter table profiles enable trigger user;
alter table news enable trigger user;
alter table ads enable trigger user;

commit;
