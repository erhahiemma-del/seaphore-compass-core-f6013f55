ALTER TABLE public.okl_records DROP CONSTRAINT IF EXISTS okl_records_kind_check;
ALTER TABLE public.okl_records ADD CONSTRAINT okl_records_kind_check
  CHECK (kind = ANY (ARRAY[
    'ENTITY'::text,
    'RELATIONSHIP'::text,
    'PATTERN'::text,
    'RISK'::text,
    'DECISION'::text,
    'OUTCOME'::text,
    'RECOMMENDATION'::text,
    'LESSON_LEARNED'::text,
    'RECOMMENDATION_RESULT'::text
  ]));