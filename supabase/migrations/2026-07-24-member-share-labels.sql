alter table members add column if not exists share_labels boolean not null default false;
-- default false = others see only "Busy", never the real block labels/rooms
