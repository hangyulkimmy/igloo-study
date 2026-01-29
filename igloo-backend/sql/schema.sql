CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  level text NOT NULL,
  title text NOT NULL,
  questions jsonb NOT NULL,
  answer_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  subject text NOT NULL,
  level text NOT NULL,
  answers jsonb NOT NULL,
  score int NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
