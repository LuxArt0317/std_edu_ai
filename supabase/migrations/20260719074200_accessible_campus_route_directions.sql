alter table public.campus_edges
  add column if not exists instruction_reverse_zh text,
  add column if not exists instruction_reverse_en text;

update public.campus_edges
set instruction_reverse_zh=coalesce(instruction_reverse_zh, '沿相反方向繼續前進'),
    instruction_reverse_en=coalesce(instruction_reverse_en, 'Continue along this connector in the reverse direction')
where instruction_reverse_zh is null or instruction_reverse_en is null;

alter table public.campus_edges
  alter column instruction_reverse_zh set not null,
  alter column instruction_reverse_en set not null;

comment on column public.campus_edges.instruction_reverse_zh is 'Human-reviewed Traditional Chinese instruction when a bidirectional connector is traversed from to_node to from_node.';
comment on column public.campus_edges.instruction_reverse_en is 'Human-reviewed English instruction when a bidirectional connector is traversed from to_node to from_node.';
