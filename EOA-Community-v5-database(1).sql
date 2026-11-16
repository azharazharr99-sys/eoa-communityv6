-- EOA COMMUNITY v5 | Supabase schema + RLS
-- Jalankan seluruh file ini satu kali melalui Supabase Dashboard > SQL Editor.
-- Jangan pernah menaruh service_role/secret key di frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Anggota EOA',
  city text,
  role text not null default 'member' check (role in ('member','admin')),
  status text not null default 'pending' check (status in ('pending','active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 3000),
  category text not null default 'Informasi',
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists announcements_created_at_idx on public.announcements (created_at desc);

alter table public.profiles enable row level security;
alter table public.community_settings enable row level security;
alter table public.announcements enable row level security;

-- SECURITY DEFINER menghindari policy profiles yang membaca tabel profiles secara rekursif.
create or replace function public.is_eoa_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

revoke all on function public.is_eoa_admin() from public;
grant execute on function public.is_eoa_admin() to authenticated;

-- Hanya admin aktif yang dapat menyetujui anggota. Fungsi ini berjalan dengan hak pemilik.
create or replace function public.approve_eoa_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_eoa_admin() then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;

  update public.profiles
  set status = 'active', updated_at = now()
  where id = member_id and role = 'member' and status = 'pending';

  if not found then
    raise exception 'Anggota tidak ditemukan atau sudah aktif.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.approve_eoa_member(uuid) from public;
grant execute on function public.approve_eoa_member(uuid) to authenticated;

-- Hapus policy versi sebelumnya agar file aman dijalankan ulang.
drop policy if exists "Profiles readable by authenticated users" on public.profiles;
drop policy if exists "Users update own basic profile" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;
drop policy if exists "Profiles: read own or admin" on public.profiles;
drop policy if exists "Profiles: member update own basic data" on public.profiles;
drop policy if exists "Profiles: admin update" on public.profiles;
drop policy if exists "Settings readable by everyone" on public.community_settings;
drop policy if exists "Admins manage settings" on public.community_settings;
drop policy if exists "Announcements readable by everyone" on public.announcements;
drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists "Announcements: public read" on public.announcements;
drop policy if exists "Announcements: admin insert" on public.announcements;
drop policy if exists "Announcements: admin update" on public.announcements;
drop policy if exists "Announcements: admin delete" on public.announcements;

-- Direktori anggota hanya dapat dibaca setelah login. Tidak ada email/password di tabel profil.
create policy "Profiles readable by authenticated users"
on public.profiles for select to authenticated using (true);

-- Tidak ada UPDATE langsung pada profil dari browser. Persetujuan admin memakai RPC di atas.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Pengaturan dashboard dapat dibaca publik, tetapi hanya admin aktif yang dapat mengubahnya.
create policy "Settings readable by everyone"
on public.community_settings for select to anon, authenticated using (true);
create policy "Admins manage settings"
on public.community_settings for all to authenticated
using (public.is_eoa_admin())
with check (public.is_eoa_admin());
grant select on public.community_settings to anon, authenticated;
grant insert, update, delete on public.community_settings to authenticated;

-- Pengumuman dapat dibaca publik, hanya admin aktif yang dapat mengelolanya.
create policy "Announcements readable by everyone"
on public.announcements for select to anon, authenticated using (true);
create policy "Admins manage announcements"
on public.announcements for all to authenticated
using (public.is_eoa_admin())
with check (public.is_eoa_admin());
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

-- Profil otomatis dibuat ketika pengguna mendaftar melalui Supabase Auth.
create or replace function public.handle_new_eoa_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, city)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Anggota EOA'),
    nullif(new.raw_user_meta_data ->> 'city', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_eoa on auth.users;
create trigger on_auth_user_created_eoa
after insert on auth.users
for each row execute procedure public.handle_new_eoa_user();

-- Data awal dashboard. Nilai yang sudah diedit tidak ditimpa saat SQL dijalankan ulang.
insert into public.community_settings (key, value) values
('welcome_title', 'Membangun koneksi, menciptakan dampak.'),
('welcome_description', 'Ruang kolaborasi untuk bertumbuh, berbagi gagasan, dan menciptakan karya.'),
('about_title', 'Satu ruang, banyak kemungkinan.'),
('about_text', 'EOA Community menjadi tempat bertukar ide, membangun relasi, dan mengembangkan proyek bersama.')
on conflict (key) do nothing;

-- AKTIVASI ADMIN (jalankan setelah akun admin berhasil mendaftar dan email terverifikasi):
-- update public.profiles set role = 'admin', status = 'active', updated_at = now()
-- where id = 'UUID-AKUN-MILIKMU';
--
-- Aktifkan Realtime untuk profiles, announcements, community_settings melalui
-- Database > Publications > supabase_realtime jika belum aktif.
