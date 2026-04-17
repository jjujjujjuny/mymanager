// 오늘의 영어 표현 데이터 & 유틸 (현대 슬랭 / 실용 표현)
const IDIOMS = [
  { en: "No cap", kr: "거짓말 아니고 진심으로", ex: "That was the best meal I've had this year, no cap." },
  { en: "Lowkey", kr: "은근히, 솔직히 좀", ex: "I lowkey want to skip the party and just stay home." },
  { en: "Highkey", kr: "대놓고, 진짜 많이", ex: "I'm highkey obsessed with this song right now." },
  { en: "Vibe", kr: "분위기, 느낌 (동사: 잘 어울리다)", ex: "This café has such a good vibe. / We totally vibed." },
  { en: "Slay", kr: "완벽하게 해내다, 죽이다", ex: "You absolutely slayed that presentation." },
  { en: "It's giving...", kr: "~느낌이야, ~분위기 풍겨", ex: "That outfit is giving main character energy." },
  { en: "That's a W", kr: "그거 완전 승리야, 잘했다", ex: "Got the internship offer — that's a huge W." },
  { en: "That's an L", kr: "그거 완전 패배야, 안됐다", ex: "Forgot my umbrella and it's pouring — total L." },
  { en: "Based", kr: "멋있다, 소신 있다, 인정", ex: "He said exactly what everyone was thinking. That's so based." },
  { en: "Mid", kr: "평범함, 별로임 (mediocre)", ex: "The movie was hyped but honestly it was pretty mid." },
  { en: "Caught in 4K", kr: "완전히 들켰다, 부인 불가", ex: "He denied it but we have the screenshots — caught in 4K." },
  { en: "Understood the assignment", kr: "완벽히 파악해서 제대로 해냈다", ex: "She wore red to the protest — really understood the assignment." },
  { en: "Ate (that)", kr: "완벽하게 해냈다, 잘했다", ex: "You ate that solo performance. Left no crumbs." },
  { en: "It hits different", kr: "독특하게 와닿다, 유독 느낌이 다르다", ex: "Listening to this album at 3am hits different." },
  { en: "Situationship", kr: "정의되지 않은 애매한 연애 관계", ex: "We're not dating but we're not just friends either — classic situationship." },
  { en: "Bussin", kr: "맛있다, 진짜 좋다", ex: "Bro this tteokbokki is bussin, where did you get it?" },
  { en: "Red flag", kr: "경고 신호, 위험 징조", ex: "He texts back three days later? That's a major red flag." },
  { en: "Green flag", kr: "좋은 신호, 긍정적인 특성", ex: "He remembered what I said last week — green flag for sure." },
  { en: "Ghost (someone)", kr: "연락을 갑자기 끊다, 잠수타다", ex: "We were texting every day and then she just ghosted me." },
  { en: "Touch grass", kr: "인터넷 좀 끄고 밖에 나가라", ex: "You've been arguing online for six hours. Go touch grass." },
  { en: "Main character energy", kr: "자신이 주인공인 것처럼 행동하는 것", ex: "She walked in like she owned the place — full main character energy." },
  { en: "Salty", kr: "씁쓸한, 삐진, 언짢은", ex: "He's still salty about losing the game last week." },
  { en: "Clout", kr: "온라인에서의 영향력, 인기", ex: "He only went to that event for the clout." },
  { en: "Spill the tea", kr: "뒷얘기(가십)을 털어놓다", ex: "Okay, spill the tea — what happened between them?" },
  { en: "I'm dead", kr: "너무 웃겨서 죽겠다", ex: "He slipped on nothing and fell — I'm dead." },
  { en: "Catch feelings", kr: "의도치 않게 감정이 생기다 (주로 연애)", ex: "We were just hanging out and I started catching feelings." },
  { en: "Era", kr: "지금 이 시기, 내 ○○ 시절 (phase)", ex: "I'm entering my productive era. No more procrastinating." },
  { en: "The ick", kr: "갑자기 생기는 거부감 (호감이 식는 순간)", ex: "He chewed with his mouth open and I instantly got the ick." },
  { en: "Manifesting", kr: "이루어질 거라고 믿으며 바라다", ex: "I'm manifesting this job offer so hard right now." },
  { en: "Vibe check", kr: "상대방의 분위기/기분을 파악하다", ex: "Vibe check — are you actually okay or just saying that?" },
  { en: "IYKYK", kr: "아는 사람만 아는 것 (if you know you know)", ex: "The back corner of that library at midnight, IYKYK." },
  { en: "Rizz", kr: "자연스러운 매력, 이성을 끄는 카리스마", ex: "He didn't even try and she was into him — dude has rizz." },
  { en: "Nailed it", kr: "완벽하게 해냈다", ex: "First attempt at parallel parking and I nailed it." },
  { en: "Living rent free in my head", kr: "머릿속에서 떠나질 않다", ex: "That comment he made two weeks ago is still living rent free in my head." },
  { en: "Put on blast", kr: "공개적으로 망신 주다, 폭로하다", ex: "She screenshotted the chat and put him on blast on her story." },
  { en: "Side quest", kr: "예상치 못한 곁다리 일이나 모험", ex: "We tried to find one café and ended up on a two-hour side quest." },
  { en: "Unhinged", kr: "제정신이 아닌, 돌발적인 (주로 유쾌하게 쓰임)", ex: "Her 2am energy is genuinely unhinged and I love it." },
  { en: "Serve", kr: "완벽하게 보여주다, 외모가 죽여준다", ex: "She walked in serving looks and I was not ready." },
  { en: "Not it", kr: "그건 내 일 아님, 별로임", ex: "Waking up at 5am for practice? Not it." },
  { en: "NPC", kr: "스스로 생각 안 하는 사람, 로봇 같은 사람", ex: "He just follows whatever his group does — total NPC behavior." },
  { en: "Soft launch", kr: "슬쩍 공개하다 (주로 새 연애를 암시적으로)", ex: "She posted a hand in her photo — classic soft launch." },
  { en: "Hard launch", kr: "공식적으로 발표하다 (주로 연인을)", ex: "They went from soft launch to hard launch in one week." },
  { en: "Core memory", kr: "아주 깊이 남은 소중한 기억", ex: "That road trip became an instant core memory." },
  { en: "It's not giving", kr: "기대에 못 미친다, 별로다", ex: "I tried to recreate the look but it's just not giving." },
  { en: "That's sending me", kr: "너무 웃겨서 죽겠다", ex: "The way he reacted to that jump scare is sending me." },
  { en: "Down bad", kr: "누군가에게 심하게 빠져 있다, 처절하다", ex: "He drove two hours just to see her for 20 minutes. He's down bad." },
  { en: "The audacity", kr: "뻔뻔함, 그 배짱이 대단하다", ex: "She asked to borrow money right after ignoring me for a month. The audacity." },
  { en: "No thoughts, head empty", kr: "아무 생각 없음, 순수하게 즉흥적", ex: "It's Friday night. No thoughts, head empty, just vibing." },
  { en: "Chronically online", kr: "인터넷에 너무 오래 살아서 현실 감각이 없는", ex: "Only a chronically online person would get offended by that." },
  { en: "Parasocial", kr: "일방적인 친밀감 (팬이 연예인에게 느끼는 관계)", ex: "I know too much about his daily life — I've gone full parasocial." },
  { en: "Ratio'd", kr: "반박 댓글이 원글보다 더 많이 공감받다", ex: "He posted a bad take and got absolutely ratio'd." },
  { en: "Big if true", kr: "사실이면 대박인데, 진짜라고?", ex: "They're dropping a surprise album tonight? Big if true." },
  { en: "Cope", kr: "현실 부정하며 자위하다 (비꼬는 표현)", ex: "He said the team actually played well. That's some serious cope." },
  { en: "That's wild", kr: "완전 말도 안 된다, 대박이다", ex: "He quit his job over text? That's wild." },
  { en: "Gatekeep", kr: "좋은 정보나 장소를 혼자만 알고 있다", ex: "I've been gatekeeping this restaurant because I don't want it to get crowded." },
  { en: "Plot twist", kr: "예상 못 한 반전", ex: "Plot twist — she was the one who set it all up." },
  { en: "Gaslight", kr: "상대방이 현실을 의심하게 만들다", ex: "He tried to gaslight me into thinking I never sent the email." },
  { en: "Glow up", kr: "외모나 삶의 질이 크게 좋아지다", ex: "She had the biggest glow up over summer break." },
  { en: "Villain arc", kr: "착한 걸 그만두고 자기 중심적으로 사는 시기", ex: "I'm done being nice — entering my villain arc." },
  { en: "Beige flag", kr: "나쁘진 않지만 좀 독특한 특성", ex: "He organizes his bookmarks by color. Beige flag but kind of cute." },
  { en: "Toxic trait", kr: "내 안의 안 좋은 버릇이나 성향", ex: "My toxic trait is saying 'I'll start tomorrow' every single night." },
  { en: "Cringe", kr: "보기 민망하다, 오글거린다", ex: "Looking back at my old Facebook posts is so cringe." },
  { en: "Left on read", kr: "메시지를 읽고 답장 안 하다", ex: "I texted him two days ago and he left me on read." },
  { en: "That's not giving what you think it's giving", kr: "네가 원하는 효과가 전혀 안 나오고 있어", ex: "That color combo is not giving what you think it's giving." },
  { en: "Be so fr", kr: "진짜로, 솔직히 (be so for real)", ex: "Be so fr, is he actually mad about that?" },
  { en: "It's the ___ for me", kr: "특히 ~가 포인트야 (특정 부분을 지목)", ex: "It's the confidence for me — he was completely wrong but so sure." },
  { en: "Sleep on (something)", kr: "과소평가하다, 모르고 지나치다", ex: "Don't sleep on this album — it's actually incredible." },
  { en: "Flop era", kr: "뭘 해도 안 풀리는 시기", ex: "I'm in a flop era. Three rejections in one week." },
  { en: "I can't even", kr: "말문이 막히다, 어이없어서 말이 안 나온다", ex: "He showed up an hour late and acted surprised. I can't even." },
  { en: "That's on you", kr: "그건 네 책임이야", ex: "You knew the deadline was today. That's on you." },
  { en: "Understood", kr: "알겠어, 파악했어 (짧고 쿨하게 수긍)", ex: "You want me to lead the project? Understood." },
  { en: "Periodt", kr: "이게 끝이야, 더 말 필요 없어 (period 강조형)", ex: "We're not going back to that restaurant. Periodt." },
  { en: "It's giving chaos", kr: "완전 혼란 그 자체야", ex: "Six group chats going at once — it's giving chaos." },
  { en: "Not gonna lie (NGL)", kr: "솔직히 말하면", ex: "NGL, I thought it was going to be way harder." },
  { en: "Hits close to home", kr: "너무 공감된다, 찔린다", ex: "That meme about procrastinating really hits close to home." },
  { en: "I'm not even surprised", kr: "전혀 놀랍지 않다, 예상했어", ex: "He forgot again? I'm not even surprised at this point." },
  { en: "Living for it", kr: "완전 좋아, 너무 즐기고 있어", ex: "She's being so extra today and honestly I'm living for it." },
  { en: "That's giving me life", kr: "이거 보고 살 것 같다, 너무 좋아", ex: "Her reaction to the surprise is giving me life." },
  { en: "Rooting for you", kr: "응원하고 있어", ex: "I know the interview is scary but I'm rooting for you." },
  { en: "Manifested it", kr: "이루어지길 믿었더니 됐다", ex: "I said I wanted a free day and it rained all weekend — manifested it." },
];

// 오늘 날짜 기반 인덱스
function todayIndex() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 864e5);
  return dayOfYear % IDIOMS.length;
}

export function getTodayIdiom() { return IDIOMS[todayIndex()]; }

// offset: 0=오늘, -1=어제, +1=내일 등
export function getIdiomAt(offset) {
  const idx = ((todayIndex() + offset) % IDIOMS.length + IDIOMS.length) % IDIOMS.length;
  return IDIOMS[idx];
}

export const IDIOM_COUNT = IDIOMS.length;

// 오늘 체크 여부
const DONE_KEY = () => `idiom_done_${new Date().toISOString().split('T')[0]}`;
export function isIdiomDoneToday() { return localStorage.getItem(DONE_KEY()) === '1'; }
export function markIdiomDone()    { localStorage.setItem(DONE_KEY(), '1'); }
