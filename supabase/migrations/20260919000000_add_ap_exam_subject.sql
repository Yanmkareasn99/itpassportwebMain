INSERT INTO public.subjects (id, name, description, color)
VALUES (
  'ab000000-0000-0000-0000-000000000001',
  '応用情報技術者試験 午前',
  '応用情報技術者試験の午前問題',
  '#F97316'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color;
