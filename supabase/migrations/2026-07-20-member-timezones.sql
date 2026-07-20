alter table members add column if not exists tz text;
-- null means "same timezone as the viewer / no conversion"
