
CREATE POLICY "anon_select_questions" ON questions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_questions" ON questions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_choices" ON answer_choices FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_choices" ON answer_choices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_subjects" ON subjects FOR SELECT TO anon USING (true);
