-- Public university program directory captured 2026-11-14 Taipei.
-- The source links use changing request parameters. The verified PDFs are local assets.
create table public.affairs_interdisciplinary_programs (
  code text primary key check (code ~ '^PU[0-9]{3}$'),
  name text not null check (length(btrim(name)) between 1 and 300),
  department text not null check (length(department) <= 300),
  partners text not null check (length(partners) <= 500),
  year text not null check (year ~ '^[0-9]{3}$'),
  credits text not null check (credits ~ '^[0-9]{1,3}$'),
  document_sha256 text check (document_sha256 ~ '^[a-f0-9]{64}$')
);

alter table public.affairs_interdisciplinary_programs enable row level security;
revoke all on public.affairs_interdisciplinary_programs from public, anon, authenticated;
grant select on public.affairs_interdisciplinary_programs to anon, authenticated;
create policy interdisciplinary_programs_public_read on public.affairs_interdisciplinary_programs
  for select to anon, authenticated using (true);

insert into public.affairs_interdisciplinary_programs
  (code, name, department, partners, year, credits, document_sha256)
values
  ('PU002', '日語領隊導遊證照', '休觀系', '應外系', '096', '20', 'd7af10c4cbb22a746fc6bbd00cb9a40ea00b6738de708d99ed9aaa008da82d93'),
  ('PU007', '觀光日語', '應外系', '休觀系', '096', '15', '2748436f7474ed0a115510d4e64de18d0ed6787de28f9ebad8e1901c2675b26c'),
  ('PU011', '觀光休閒行銷企劃', '行銷系', '休觀系、休運系、管理學院', '096', '15', 'b68ac0d0206b3ee23d96b059e4bd8351b467c26d48f2b143b2ef08f61d311c44'),
  ('PU014', '物流行銷', '流通系', '管理學院、行銷系', '096', '15', '07a7d80f7e56ef1faba293d8a13ed9d32a2222e5eeb95a6469ce1233c51603a7'),
  ('PU015', '休閒事業通路', '流通系', '休觀系、管理學院', '096', '15', 'bc11910a9735e1bc4a4059871f5b8ecf89d32ce4fc1bfaf2ef856f1854873764'),
  ('PU018', '流行生活飾品設計', '流設系', '產設系', '096', '15', '0ec2a7263ef88cc86c0aa76363c1afd24512e7014698555305681ecc931a935b'),
  ('PU023', '財務與金融', '企管系', '金融系', '096', '15', '9f70efd2f9471cc40b7423bc20eb748357b897a2330422bd593165672db91e20'),
  ('PU030', '兒童繪本教學應用', '兒家系', '視傳系', '096', '16', 'e7df54a043566f017795a05c26eed69d48f845e032b0ca7328e219c60a1cbecf'),
  ('PU031', '兒童雙語教育', '兒家系', '應外系', '096', '15', 'c7cc793c7a73928001ba4e48cdfa4a8263616b5c49bb24399ad3eb80fb6dd630'),
  ('PU044', '文化創意與工藝飾品設計', '產設系', '流設系、演藝系', '097', '20', '0a2ec8af7705d7c3bc79b6a6a871627cb23973d3f5a14edfbbf2891248191675'),
  ('PU056', '幼兒華語教育', '應外系', '兒家系', '103', '16', '7e044f5bdff36e3c155f9c7d734afae253dcc975b6c19e65aec77aab9df8c67b'),
  ('PU057', '跨域整合創新創意', '設院', '應用社會學院、資訊學院、設計學院及其各系', '105', '15', '4bfac701108f68c1a6ca3516b4fc47b73dafe93e81048ab45f475aa4cb714249'),
  ('PU058', '社會企業行銷', '社工系', '行銷系', '106', '15', '19558f43ee864cbf93b21d55d8a1113bc7c6a22f284d4544ad86e473af5ad43f'),
  ('PU059', '社會工作服務設計', '社工系', '產設系', '106', '15', '635ad6bc9dab65ac782e4f592259aa0ebacee2fc6d58e6d836f1b5ad31646f84'),
  ('PU060', '國際商務與證照(雙語授課)', '應外系', '行銷系', '106', '15', 'dcd28dd940e8a5aa64ce6bff4f4e9a6b63b0aa4a2f82486e9ae68b1518e1f19c'),
  ('PU063', '經營管理(雙語授課)', '管院', '企管,會展,金融,流通,行銷,餐旅,休觀,國際學程', '106', '15', '086026ddd639ad2e97e42044ab4588df67eb084406acfd7160eb3e14cfe46436'),
  ('PU064', '休閒暨烘焙管理', '休觀系', '餐旅系', '106', '18', '85df881e39f0ebc30c4175bcf3be0a3a82a105817bb2afeca5b4eb445304b69d'),
  ('PU065', '科技金融管理', '金融系', '資管系、視傳系、資工系', '106', '15', 'e4072bc5686f904120f59efc04c5f7cdb233d6dd8a8fa5582b2bf7fac311b84a'),
  ('PU067', '電子商務經營', '管院', '流通系、行銷系、會展系', '106', '19', '382b1b19809d25d5436547b7372fc95f0ac9e4ff6756853d9c94d2190e2d2633'),
  ('PU068', '烘焙微創', '管院', '餐旅系、企管系', '106', '18', 'cfc31daad56db24c680462fdac5be8b88fee866cc6a653abecb2a9e1e290a594'),
  ('PU069', '會議展覽暨獎勵旅遊', '管院', '休觀系、會展系', '106', '15', 'dde7cb1512d799cd0da39a457158c19d5b1ab311bb44a09c968b794f0384aed5'),
  ('PU071', '餐旅管理實務', '應外系', '餐旅系', '107', '15', 'ef36b823cd46c89a04786d670fc4878c9ac4dc25de30a0d7afe1cdf0e4986f22'),
  ('PU073', '金融資訊安全', '資院', '資工系、資管系、金融系', '108', '21', '5e778491196d978d70979a96282605b359f089cc149bfc63ed3081cb8396e940'),
  ('PU075', '早期療育服務', '兒家系', '社工系', '109', '15', 'cb69ce9bf9cc0f9506d0fc289943a0c36426b3f6a7d20a5fc82ad58c23d96858'),
  ('PU076', '早期療育與社會工作', '社工系', '兒家系', '109', '15', 'bb1f257388cf3fa38adae26718504d1e7081ffebd6b491ea5ecd50f2f09c2d7f'),
  ('PU077', '餐旅事業與金流', '金融系', '餐旅系', '111', '15', 'e17e29a505bfc1286abd7ac8ad5fc81a3a1841c417b76ef21b275bf06657b38c'),
  ('PU078', '跨域設計 × 綠色創生', '設院', '管理學院、應用社會學院、資訊學院、通識教育學院', '111', '16', 'a6c6430779dbb91713040fe3208cd7d2a01d4a05a5e09f1eb571d253d2a8b1d4'),
  ('PU079', '體感遊戲與互動媒體設計', '電競娛樂系', '動畫與遊戲設計系', '111', '15', 'bde31aabcfe3d2e1e53a59eac021ea01b6b086f48327d715ad3d4efa4f9cd1c0'),
  ('PU080', '活動管理與餐旅設計', '管院', '會展系、餐旅系', '111', '15', '524e2c82e81cb400230b3e76ca568e262d6597aa5950ed75c958eecc011c8149'),
  ('PU081', '時尚造型設計', '美髮系', '流行設計系', '112', '15', '6448ab56fbed2494b32be376840b41ada66427160d4b7fb5b93ae0cffc1207c4'),
  ('PU082', '人工智慧探索應用學分學程 (TAICA)', '資院', '資工系、電通系', '115', '15', null),
  ('PU083', '人工智慧工業應用學分學程 (TAICA)', '資院', '資工系、電通系', '115', '15', null),
  ('PU084', '人工智慧自然語言技術學分學程 (TAICA)', '資院', '資工系、電通系', '115', '15', null),
  ('PU085', '人工智慧視覺技術學分學程 (TAICA)', '資院', '資工系、電通系', '115', '15', null),
  ('PU086', '人工智慧資訊安全技術學分學程 (TAICA)', '資院', '資工系、電通系', '115', '15', null);
