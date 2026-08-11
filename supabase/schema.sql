-- Profiles: extends Supabase auth.users with role info
create table profiles (
  id uuid references auth.users(id) primary key,
  email text unique not null,
  name text,
  role text default 'unassigned', -- 'unassigned' | 'orchestrator' | 'participant'
  created_at timestamp default now()
);

-- Problems: ships with 30 defaults, orchestrator can add more
create table problems (
  id serial primary key,
  title text not null,
  initial_statement text not null,
  hidden_root_cause text not null,
  osi_layer text,
  credit_start int default 10,
  question_limit int default 14,
  is_default boolean default true,
  created_by uuid references profiles(id),
  created_at timestamp default now()
);

-- Assignments: orchestrator assigns a problem to a participant by email
create table assignments (
  id serial primary key,
  orchestrator_id uuid references profiles(id) not null,
  participant_email text not null,
  participant_name text,
  problem_id int references problems(id) not null,
  status text default 'assigned', -- 'assigned' | 'in_progress' | 'completed'
  assigned_at timestamp default now(),
  completed_at timestamp
);

-- Sessions: one exercise attempt tied to an assignment
create table sessions (
  id serial primary key,
  assignment_id int references assignments(id) not null,
  started_at timestamp default now(),
  ended_at timestamp,
  final_csat_avg numeric,
  final_credit int,
  root_cause_identified boolean default false
);

-- Question log: every question/action turn within a session
create table question_log (
  id serial primary key,
  session_id int references sessions(id) not null,
  turn_number int not null,
  phase text, -- 'assess' | 'acquire' | 'analyse' | 'act'
  question_text text not null,
  ai_feedback text,
  csat_score int,
  credit_delta int,
  credit_remaining int,
  created_at timestamp default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table assignments enable row level security;
alter table sessions enable row level security;
alter table question_log enable row level security;

-- Policies: participants see only their own; orchestrators see all
create policy "own profile" on profiles for select using (auth.uid() = id);

create policy "orchestrator sees all assignments" on assignments for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'orchestrator'));

create policy "participant sees own assignments" on assignments for select
  using (participant_email = (select email from profiles where id = auth.uid()));

create policy "orchestrator sees all sessions" on sessions for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'orchestrator'));

create policy "participant sees own sessions" on sessions for select
  using (assignment_id in (select id from assignments where participant_email = (select email from profiles where id = auth.uid())));
