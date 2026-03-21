create table kanji_master (
    id uuid primary key default gen_random_uuid(),
    character text not null unique,
    readings jsonb not null default '{}',
    meanings text[],
    frequency int    -- kanjidic2 freq rank, lower = more common, null = rare
);

create table user_kanji (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users,
    kanji_id        uuid references kanji_master,
    status          text check (status in ('familiar', 'learning')),
    familiarity     int default 0,
    next_review     timestamptz,
    source_photo_id uuid,
    created_at      timestamptz default now()
);

create table photo_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users,
    image_url text,
    raw_claude_response jsonb,
    created_at timestamptz default now()
);

create table quiz_generation_jobs (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users,
    kanji_id    uuid references kanji_master,
    status      text default 'pending'
        check (status in ('pending', 'processing', 'done', 'failed')),
    attempts    int default 0,
    created_at  timestamptz default now()
);

create type quiz_type as enum (
  'meaning_recall',       -- word level: kanji → meaning
  'reading_recognition',  -- word level: kanji → furigana
  'reverse_reading',      -- word level: furigana → kanji
  'bold_word_meaning',    -- sentence level: marked word → meaning
  'fill_in_the_blank'     -- sentence level: gap → kanji/word (MC or type)
);

create table quiz_bank (
                           id            uuid primary key default gen_random_uuid(),
                           user_id       uuid references auth.users,
                           kanji_id      uuid references kanji_master,
                           quiz_type     quiz_type not null,
                           prompt        text not null,   -- sentence, gapped sentence, or bare kanji character
                           furigana      text,            -- reading hint displayed below the prompt
                           target        text not null,   -- the word/kanji being tested (bold marker or gap fill)
                           answer        text not null,
                           distractors   text[],          -- always 3 entries for MC types
                           explanation   text,            -- e.g. "電 also appears in 電話, 電気, 電池"
                           served_at     timestamptz,
                           created_at    timestamptz default now()
);

-- Indexes

-- kanji_master: character already has a unique index; add frequency for sorted lookups
create index idx_kanji_master_frequency on kanji_master (frequency asc nulls last);

-- user_kanji: prevent duplicate user+kanji pairs, fast per-user lookups
create unique index idx_user_kanji_user_kanji on user_kanji (user_id, kanji_id);
-- daily quiz selection: find overdue reviews per user
create index idx_user_kanji_next_review on user_kanji (user_id, next_review)
    where next_review is not null;

-- quiz_generation_jobs: worker polls for pending jobs
create index idx_quiz_jobs_pending on quiz_generation_jobs (status, created_at)
    where status in ('pending', 'failed');

-- photo_sessions: user's photo history
create index idx_photo_sessions_user on photo_sessions (user_id);

-- quiz_bank: daily quiz selection — unserved quizzes per user
create index idx_quiz_bank_unserved on quiz_bank (user_id, created_at)
    where served_at is null;
-- quiz detail view: quizzes for a specific kanji per user
create index idx_quiz_bank_user_kanji on quiz_bank (user_id, kanji_id);

-- Row Level Security

-- kanji_master: read-only reference data, anyone authenticated can read
alter table kanji_master enable row level security;
create policy "kanji_master_select" on kanji_master
    for select to authenticated using (true);

-- user_kanji: users can only access their own rows
alter table user_kanji enable row level security;
create policy "user_kanji_select" on user_kanji
    for select to authenticated using (auth.uid() = user_id);
create policy "user_kanji_insert" on user_kanji
    for insert to authenticated with check (auth.uid() = user_id);
create policy "user_kanji_update" on user_kanji
    for update to authenticated using (auth.uid() = user_id);

-- photo_sessions: users can only access their own sessions
alter table photo_sessions enable row level security;
create policy "photo_sessions_select" on photo_sessions
    for select to authenticated using (auth.uid() = user_id);
create policy "photo_sessions_insert" on photo_sessions
    for insert to authenticated with check (auth.uid() = user_id);

-- quiz_generation_jobs: users can read their own jobs, inserts handled by backend
alter table quiz_generation_jobs enable row level security;
create policy "quiz_jobs_select" on quiz_generation_jobs
    for select to authenticated using (auth.uid() = user_id);
create policy "quiz_jobs_insert" on quiz_generation_jobs
    for insert to authenticated with check (auth.uid() = user_id);

-- quiz_bank: users can read and update (served_at) their own quizzes
alter table quiz_bank enable row level security;
create policy "quiz_bank_select" on quiz_bank
    for select to authenticated using (auth.uid() = user_id);
create policy "quiz_bank_update" on quiz_bank
    for update to authenticated using (auth.uid() = user_id);