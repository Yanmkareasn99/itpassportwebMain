INSERT INTO public.subjects (id, name, description, color)
VALUES (
  'cc000004-0000-0000-0000-000000000001',
  '未分類（ITパスポート）',
  '問題取込時に設定した科目範囲に含まれないITパスポート問題',
  '#94A3B8'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color;
