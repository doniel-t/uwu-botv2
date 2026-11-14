# Memory review: memory-fresh.db

392 active facts about 14 people, 14 profiles. Most facts are real, specific and backed by a matching quote. The problems below are listed by priority, with the fact id (`#id`) in the local database.

## 1. Bug: 5 profiles are out of date
Written during the test runs with 1-2 facts and never rewritten, although these people now have many facts:
AHAHAHAHAHAHAHA (1 -> 94), FIH ENTHRALLEE (2 -> 46), LeftDoge (1 -> 41), ohneaim (1 -> 21), Til_0204 (1 -> 15).
Their profiles below are based on their messages only, hardly on facts. Fix: rewrite a profile whenever its fact count changed (code fix + re-run profiles only).

## 2. Delete before merging: private or sensitive
| Fact | Person | Why |
| --- | --- | --- |
| #45 lives in Munich | Big Kahuna Burger | The stored proof quote contains a **full street address**. `/memory source` and the bot's proof tool would show it in Discord. |
| #177 father died | AHAHAHAHAHAHAHA | Death in the family; "(not lars)" suggests a joke, roast material it shouldn't be. |
| #349 autism | AHAHAHAHAHAHAHA | Diagnosis; quote is just "autism", earlier messages joke about faking it. |
| #269 / #270 melatonin | LeftDoge / FIH ENTHRALLEE | Medication. |

## 3. Probably wrong
| Fact | Person | Why |
| --- | --- | --- |
| #220 owns a döner shop | AHAHAHAHAHAHAHA | "my dönerbude" = their usual döner place. |
| #187 bachelor in business, 1.0 | Big Kahuna Burger | Quote is about someone else ("in **his** bachelors degree"); also feeds the profile ("studied business at HM"). |
| #35 lives in Meitingen | ohneaim | The quote doesn't mention Meitingen, and it replaced #19 "lives in Augsburg" (quote: "Ich hab jetzt eine Wohnung in Augsburg"). |
| #132 has no bachelor's degree | Til_0204 | Contradicts #289 "Bachelor of Engineering"; one of them is a joke. |
| #155 owns two monitors | LeftDoge | He was selling them. |
| #123 owns motorcycles | LeftDoge | Quote is "neue deko" (might still be true, but not from this quote). |
| #85 owns an EV charger | HST_Tutorials | Just "Yes" to a teasing question. |
| #150 rank "Marshal" | Big Kahuna Burger | Quote "I made it" - unclear which game. |
| #385 owns a house | Big Kahuna Burger | "Me olde house" - probably a former or parents' house. |

## 4. Duplicates (harmless, just clutter)
#156/#157 3D printing (LeftDoge) · #394/#395 anime merch (FIH ENTHRALLEE) · #170/#398 LARP (DaFaris) · #265/#266 historical accuracy, #362/#363 low-health damage bonus, #374/#376 house/EDM, #214/#215 studied at HM, #24/#209/#316 car (Big Kahuna Burger) · #81/#103/#149 Elden Ring (AHAHAHAHAHAHAHA)

## 5. Trivia (optional to delete)
#260 favourite number 4 · #33 11 pairs of 3D glasses · #124 frying pan · #160 Duolingo Premium · #216 YouTube Premium · #203/#235/#296 owns a PC · #218 air conditioner · #346 water filter · #335 uses Windows

## 6. Profile notes
- **ohneaim** (stale): mentions "girlfriend or close companion Katrin" - a guess about a relationship; it'll be rewritten anyway.
- **Big Kahuna Burger**: "studied business at HM" and "bachelor's degree with a 1.0" come from #187 (probably wrong).
- **HST_Tutorials**: "lives somewhere around Munich or Ingolstadt" is a guess.
- The rest reads accurate and useful: personality, how they talk and what they're into match the chat.

## 7. To stop this in future runs (suggested code changes)
- Never store quotes that contain a street address or phone number; never learn health, medication, diagnoses or deaths in the family.
- Location facts only when the place name appears in the quote or the replied-to message.

## All profiles

### Big Kahuna Burger
facts when written: 93

Who: Big Kahuna Burger lives in Munich and works as an engineer. They studied business at HM, earned a bachelor's degree with a 1.0 grade, completed a master's thesis with the same grade, and are working on thermal-management modeling for battery-electric vehicles. They own a house, a car named Rocky, a dog, and enough technical equipment to make a small lab jealous.

Personality: They are opinionated, blunt, and theatrically exasperated. They take pride in engineering knowledge, precise explanations, automotive expertise, and academic performance. They get especially argumentative about lazy game design, historical inaccuracy, and repetitive low-health damage bonuses. Their humor mixes profanity, absurd escalation, mock outrage, and occasional unexpectedly serious reflections about suffering and emotional avoidance.

Talks like: They write casually and aggressively, with frequent “fuck,” “homie,” “get that shit out of here,” and exaggerated rhetorical questions. They confidently launch into long analytical rants, then puncture them with a meme. They react to roasting by escalating, antagonizing the target, or declaring someone’s opinion a “pleb” take.

Into: They play League of Legends, Destiny, Garry’s Mod, Helldivers 2, Minecraft, Payday 3, and others, with League favorites including Eve, Ahri, Akali, and Briar. They enjoy rock, hard rock, classic hip hop, Timbaland-era music, house, EDM, anime, cars, automotive engineering, and precisely machined hardware. They own an oscilloscope, PC, OLED TV, Canyon bicycles, Japanese Pokémon cards, and six Royal Blood vinyl records.

Reputation: The group knows them as the automotive engineer with strong opinions, expensive Pokémon cards, dramatic food reviews, and an impressive ability to turn any game mechanic into a design tribunal.

---

### HST_Tutorials
facts when written: 22

Who: HST_Tutorials works as an IT administrator and lives somewhere around Munich or Ingolstadt, with enough of a life setup to own a car, PC, server computer, AMD GPU, electric-vehicle charger, and eleven pairs of 3D glasses. They also have a parking space, YouTube Premium, and apparently a basement that occasionally becomes a Resident Evil boss arena.

Personality: Practical, organized, and frighteningly willing to become the group’s unpaid holiday coordinator. They plan accommodation, transport, expenses, food, arrival times, and voting reminders with the energy of someone personally trying to prevent eight people from ruining a vacation. They are helpful but increasingly exasperated when people ignore messages, upload thousands of images, or ask them to buy things at the last second. They can be blunt, sarcastic, and theatrically threatening, though usually in a joking way.

Talks like: Mostly German with frequent English insertions, internet slang, and phrases like “bruh,” “tbh,” “soonish,” “premium,” and “friendly reminder.” Their typing is casual and dialect-heavy, using “des,” “net,” and “a bissl.” They respond to chaos with disbelief, swearing, and increasingly specific reminders.

Into: Witcher 3, horror media, cycling, Nothing But Thieves, cat ears, Celty, blinis, and non-anime shows. They claim to be pro at no-gun gameplay. They dislike Lego, Hyundai, and Microsoft products, although even Lego-based ideas can occasionally impress them.

Reputation: The group relies on them to organize trips, settle expenses, and keep everyone moving, while teasing them about their dust-filled PC, construction mishaps, and intense logistical management.

---

### Space(-box-)
facts when written: 13

Who: Jason is a student who lives around Munich and sometimes stays in Munich afterward. He regularly plans around trains, monthly commitments, study or work obligations, and strict bedtime deadlines. He owns a Microsoft Surface laptop and is apparently trusted with enough app permissions to accidentally remove everyone’s payments instead of just one debt.

Personality: Jason is organized about schedules and surprisingly firm about deadlines, especially when people are supposed to meet early or finish before midnight. He can also be chaotic when websites, payment tools, or company cards are involved, and tends to laugh at his own disasters. He is openly enthusiastic about anime, gacha games, and Miku-related things, while defending slice-of-life anime from accusations of being uniquely “slop.” According to his own messages, he is very good at hitting low chances as a gacha player.

Talks like: He mixes up “than” and “then,” makes frequent typos, and casually combines English and German. His tone is conversational, mildly dramatic, and full of “lmao,” “bro,” “o7,” and emoji reactions. He reacts to roasting with self-deprecation, bait, and theatrical panic.

Into: He plays GeoGuessr, gacha games, and Silksong. He likes anime, the visuals of Steel Ball Run, the Cyberpunk: Edgerunners song, Miku, and femboys. He owns a Miku birthday figurine.

Reputation: The group teases him about Miku, anime scheduling, gacha luck, and accidentally causing administrative chaos.

---

### wife obliterator
facts when written: 12

Who: Wife obliterator is a member of the group with a gaming computer setup. Their messages suggest a German-speaking background or environment, and they regularly switch between German and English.

Personality: They are energetic, expressive, and highly invested in whatever currently has their attention. They react dramatically to football matches, anime announcements, and gaming news, often escalating ordinary moments into “humiliation rituals,” curses, rigging accusations, or declarations that someone is “not human.” Their humor is chaotic, sarcastic, and heavily meme-based, with a taste for absurd, ominous, and occasionally aggressive reaction images. They can be blunt when reviewing media, especially songs, but still appreciate strong visuals and references.

Talks like: They use casual English, German phrases, exaggerated capitalization, repeated letters, emoji, and short verdicts such as “W,” “GOAT,” “Sick,” “classic,” “whatever,” and “Im out.” They give quick, opinionated reviews and react to being entertained with long strings of laughter or dramatic GIFs.

Into: They play Minecraft and own a gaming PC. They like Bloodborne, One Piece, JoJo’s Bizarre Adventure, Evangelion, Asuka, Trafalgar Law, and Johnny Joestar, especially Yuki Kaji’s voice acting. They follow anime openings closely, ranking songs while praising visuals, references, and music videos. They also follow football and PlayStation announcements, with particular excitement around Bloodborne speculation.

Reputation: The group knows them for intense football reactions, anime enthusiasm, and an endless supply of reaction images and GIFs.

---

### Darc
facts when written: 9

Who: Darc attends Technische Hochschule Ingolstadt and has also discussed university projects, internships, and working around robotics and space-related facilities. They live with family, have a dog, and regularly help their parents and sister. They are interested in humanoid robots, lunar simulation, and space technology.

Personality: Darc is curious, cautious, and easily alarmed by unfamiliar things, from energy drinks to spoilers and confusing university rules. They use dry, absurd humor and often turn stressful situations into jokes. They can be sympathetic, such as feeling bad for enemies who lose their stuff, but also enjoy dark or brutal comedy. They get defensive about being asked for personal information and seem particularly stressed by professors, bosses, and administrative nonsense.

Talks like: They switch casually between English and German, with understated reactions, “wait oh no,” “smh,” “💀,” and frequent uncertainty. Their messages are conversational, self-deprecating, and often written in quick lowercase bursts. They respond to roasting with confusion, alarm, or immediate sarcastic damage control.

Into: Darc likes Destiny 1, Indiana Jones, humanoid robots, Softcakes, and games with mysterious science-fiction environments. They play or consider playing shooters, Rocket League, Mario Kart, and other multiplayer games, and claim to be skilled at first-come-first-serve slot battles. They automatically mute Spotify ads and are interested in unusual technology and game remasters.

Reputation: The group teases Darc about university chaos, work stress, accidentally supporting things without understanding them, and their elaborate excuses. They are known for sharing bizarre internet finds, robot videos, and increasingly absurd screenshots.

---

### What is 50/50?
facts when written: 9

Who: What is 50/50? is a university student who appears to live in Germany, juggling classes, exams, apartment changes, trains, trams, and university software that requires a dual-boot setup. They describe themself as a “small brain student” and have mentioned writing assembly in a hardware class.

Personality: Their humor is dry, chaotic, sarcastic, and occasionally mock-dramatic. They enjoy absurd escalation, from “rm -rf ~” and “mkfs ... /dev/sdX” jokes to grand declarations about demons, anarchy, and everything being over. They are generally easygoing and willing to join plans, but can be bluntly skeptical, saying things like “I cannot fathom someone saying that” or “tbh I am not sure if you're joking or not.” They seem comfortable making fun of themself and being teased.

Talks like: They switch between English and German, often using casual shorthand such as “tbh,” “peak,” “based,” “brother,” “W,” and “it is so over.” Their messages are frequently brief, reactive, and paired with anime or streamer-style reaction images. They respond to absurdity with more absurdity and appear unfazed by playful roasting.

Into: They play World of Warcraft and Minecraft, can build Minecraft gold farms, and prefer Factorio to Minecraft, though they admit taking a long time to set up decent circuits. They also like dogs, cats, original Rockstar energy drink, anime-style media, gacha games, and technical hardware or software setups.

Reputation: The group associates them with university chaos, complicated travel logistics, caffeine, technical jokes, and “peak” reactions.

---

### DaFaris
facts when written: 7

Who: DaFaris works and coordinates plans around work, meetings, driving, and group events. They live somewhere in Germany and own a car, which makes them a useful transport option for meetups, though fitting extra passengers can become “Tetris.” They participate in LARP and use LARP planning as a framework for organizing other projects.

Personality: Friendly, accommodating, and eager to join in, DaFaris frequently offers rides, fills missing spots, brings food, or helps with supplies. They can be enthusiastic one moment and apologetic or unavailable the next. They openly invite the group to roast them, but usually soften requests with “pls,” emojis, or a nervous “🫣.” They enjoy absurd humor, dramatic reactions, and proving a point with suspiciously specific internet material.

Talks like: They switch casually between German and English, often mixing both in one conversation. Their tone is polite and emoji-heavy, with frequent “😊,” “👀,” “O.O,” “^^,” “sry,” and “pls.” They ask directly about schedules and availability, and react to teasing with playful embarrassment rather than aggression.

Into: Their main games and interests include Blood on the Clocktower, Pokémon, League of Legends, VALORANT, Deadlock, and possibly other Riot games. They enjoy LARP, anime such as Fate/stay night: Unlimited Blade Works and Sword Art Online, the old WoW song, reaction videos, and anime merchandise.

Reputation: The group knows them as a dependable organizer, driver, filler player, and enthusiastic sharer of memes, videos, and plans.

---

### katwien
facts when written: 6

Who: Katwien is deeply involved in architecture and building-design discussions, sharing plans, façade references, technical construction details, and examples of temporary, recycled, and timber-based housing. They appear to be working on an architectural project involving split levels, circulation, seating steps, wood, and concrete. They may be connected to Ulm or Donauwörth, but their exact living situation is unclear.

Personality: Katwien is enthusiastic, opinionated, and easily baited by questionable rankings or “ragebait.” They defend their preferences with confidence, especially when stones or energy drinks are involved. They can be playful and affectionate, reacting with “yaaaay,” “uiii,” “noooooo,” and “:c,” but also deliver blunt corrections such as “You don’t know what you are talking about.” Their humor can be dark and ironic, as shown by the snow-written “inspiring quote.”

Talks like: They mix German and English casually, using slang like “low-key,” “safe S tier,” “nuh uh,” “nahhhh,” and “wild XD.” Their typing is expressive, informal, and full of elongated reactions. They seem comfortable being teased and often answer with exaggerated disbelief or mock outrage.

Into: Katwien likes basalt, granite, and gneiss, while considering sandstone boring. They enjoy okroshka and White Monster energy drinks, dislike guava Rockstar, and are interested in architecture, housing, construction details, travel accommodations, and food outings.

Reputation: The group appears to tease them about their drink rankings, stone opinions, and intense reactions to “ragebait.” Their parents supplying energy drinks is apparently notable.

---

### antipixel
facts when written: 4

Who: Antipixel’s job, studies, exact home situation, and background are not established. They do travel around Germany, including Ingolstadt, Augsburg, and nearby connections, and regularly coordinate their arrival times around group activities.

Personality: They are highly engaged in group plans, especially anime sessions, and seem willing to organize recurring events such as “JoJo Fridays.” Their humor is chaotic, sarcastic, and occasionally dark, often turning awkward situations into live entertainment. They narrate travel disasters in real time with escalating disbelief, especially when Deutsche Bahn delays, missed connections, strange passengers, and platform changes get involved. They appear comfortable laughing at themselves, though no clear defensive topics are established.

Talks like: They write in casual English with frequent typos, abbreviations, emojis, “o7,” “lul,” “👀,” and deliberately dramatic phrasing. They mix in occasional German words and expressions. Their messages are often short updates, timing guesses, or increasingly frantic status reports. They react to events with “Damn,” “Huge w,” and similar deadpan commentary.

Into: They play Satisfactory and enjoy Clair Obscur. They own an Elite controller, a dedicated GPU vertical mount, and appear technically comfortable troubleshooting Windows installation and internet setup. They regularly watch anime with the group, including JoJo, Re:Zero, Mushoku Tensei, The Rising of the Shield Hero, and Cyberpunk: Edgerunners. They also share game deals, Dead by Daylight content, and esports clips.

Reputation: The group associates them with organizing anime sessions, “JoJo Fridays,” train-delay sagas, and turning mundane technical or travel problems into ongoing dramatic broadcasts.

---

### FIH ENTHRALLEE (OUT OF DATE)
facts when written: 2

Who: FIH ENTHRALLEE appears to work an office job and lives in or around Germany, frequently mentioning Munich, trains, driving, and German daily life. They seem to have an active social circle, organizing watch sessions, trips, meals, and gaming plans.

Personality: They have a sarcastic, irreverent sense of humor and enjoy escalating absurd situations into increasingly elaborate jokes. They are comfortable roasting friends, machines, companies, and themselves, including joking about being ancient or needing help with basic computer usage. They can be impatient when explanations are too long, demanding a “tdlr,” but are also curious and willing to investigate unfamiliar topics. They seem especially defensive about being underestimated, such as insisting they are “steve ranked” rather than ordinary metal.

Talks like: They switch casually between English and German, often using lowercase, abbreviations, typos, reaction images, and deliberately dramatic phrasing. Their tone is dry, chaotic, and conversational, with frequent “bruh,” “wait,” “surely,” “hm,” and “what blud is yappin about.” They react to roasting with more roasting, exaggerated disbelief, or a sarcastic emoji.

Into: They like VTubers and follow Hololive-related content, while disliking drumstep. They play or discuss games including Deadlock and Minecraft, and are interested in technical troubleshooting, computer setup, software, and obscure game systems. They also enjoy films, anime, memes, and watching several episodes in one sitting.

Reputation: The group appears to tease them as an ancient, chaotic tech user with too many tabs and questionable computer habits. They are known for turning ordinary conversations into elaborate bits, especially involving food, travel, alcohol, and absurd business schemes.

---

### AHAHAHAHAHAHAHA (OUT OF DATE)
facts when written: 1

Who: They draw art and appear to be studying, mentioning midterm results, studies, and a workshop. They are interested in visiting Japan and openly worry about going broke on merchandise.

Personality: Highly argumentative, energetic, and proudly contrarian. They defend difficult game design and challenge runs with elaborate logic, especially the appeal of no-hit attempts and high-risk gameplay. They enjoy provoking friends, testing reactions, and turning ordinary conversations into debates. They get defensive when someone calls their preferred strategies useless, when the bot misremembers something, or when people attribute statements to them without evidence. They also seem delighted by chaos, absurdity, and “brainrot.”

Talks like: They write in fast, heavily abbreviated English with slang, profanity, lowercase typing, dramatic capitalization, and frequent emoji or Discord emotes. Their tone jumps between sarcastic analysis, mock insults, anime references, and sudden enthusiasm. They use phrases like “W,” “skill issue,” “holy,” “ratio,” “based,” and “don’t care.” They actively request roasts, interrogate the bot about its memory, and complain when it loops or gets something wrong.

Into: They enjoy games involving bosses, difficult fights, no-hit runs, and challenge-based mastery, though no rank or specific skill level is given. They discuss Honkai: Star Rail, anime, Japanese language and katakana, merchandise, tech companies, and programming the Discord bot. Their shared links and reaction GIFs heavily feature anime and internet humor.

Reputation: The group treats them as a loud debater, anime enthusiast, bot tester, and enthusiastic source of chaos.

---

### LeftDoge (OUT OF DATE)
facts when written: 1

Who: LeftDoge is German-speaking and recently got a new job, hoping to leave his current “sinking ship” workplace as soon as possible. He lives close enough to work that one commute is only two kilometres by car. He has a dad, a neighbour who invites him to motorcycle test rides, and enough home-improvement ambition to redesign his outdoor space.

Personality: He is practical, spontaneous, and casually chaotic. He takes on projects himself, from making motorcycle parking and a storm-proof roof to designing plant vases and giant Poké Balls. He is supportive and willing to give advice, but also enjoys teasing friends with dramatic comments, weird hypotheticals, and well-timed reaction images. He gets defensive about neither German nor English spelling, openly admitting he cannot spell properly in either language.

Talks like: He switches freely between German and English, often in the same conversation. His tone is relaxed, self-deprecating, and full of “bruh,” “joa,” “sry,” “tbh,” emojis, and exaggerated reactions. He reacts to roasts with more jokes, confusion, or a sarcastic counterattack rather than genuine outrage.

Into: He prefers Counter-Strike over Valorant. He plays Pokémon, raids, and emulated games, and experiments with frame skipping and turbo controls. He enjoys 3D printing, plants, motorcycles, cars, snorkeling, Dragon Ball-themed food, and tech such as reverse wireless charging.

Reputation: The group teases him about spelling, questionable construction plans, alcohol-related schemes, and his willingness to improvise. He is close enough with the group to organise Pokémon sessions, game nights, trips, and shared jokes.

---

### ohneaim (OUT OF DATE)
facts when written: 1

Who: ohneaim appears to be an adult living in Germany, communicating mainly about local plans, restaurants, trips, errands, and coordinating activities with friends. They mention their mother, brother, girlfriend or close companion Katrin, and their dog Enya. They are involved in planning group outings, including restaurant visits, a possible city trip to Vienna, football, films, a spa visit, and holiday accommodation.

Personality: They are sociable and consistently try to get people together, especially for food, films, and games. They can be apologetic when late or unavailable, but also impatiently summon everyone when a game is about to start. Their humor is casual, self-deprecating, and occasionally dramatic, with frequent “sadge,” disbelief, and exaggerated disappointment. They seem particularly invested in making plans work, while remaining flexible when others need more time.

Talks like: They switch freely between German and English, often within the same sentence. Their typing is informal, full of abbreviations, lowercase English, emojis, Discord mentions, and phrases like “lmao,” “real,” “ohh,” “i guess,” and “no stress.” They use pleading “👉 👈” when asking people to play and react to absurdity with “what u mean,” “disgusting,” or “H O L Y.”

Into: They regularly play Valorant and try to assemble full groups, while also mentioning Deadlock and Honkai: Star Rail. They enjoy anime, manga, films, football, restaurants, travel planning, and spending time with their dog. They dislike schnitzel.

Reputation: The group teases them about their chaotic scheduling, late arrivals, food choices, and attempts to organize Valorant sessions. They are closely associated with Enya, Katrin, Daniel, and the wider gaming group.

---

### Til_0204 (OUT OF DATE)
facts when written: 1

Who: Til_0204 is a self-described beginner weeb. No job, studies, location, or broader background are given. They regularly organize group activities, invite people over, suggest grilling, films, swimming, cinema, and thermal baths, and coordinate when they will arrive.

Personality: Til is playful, energetic, and highly agenda-driven. They like provoking friends with exaggerated claims, dramatic announcements, and mock threats, while also being socially proactive about getting people together. They can be self-deprecating, admitting they are “not the worst on this dc,” but also confidently promise that others will get “mogged.” They seem willing to argue over tiny details, especially when they think someone’s opinion is questionable.

Talks like: Til switches freely between German and English, with occasional Japanese phrases and anime-style wording. Their tone is casual, teasing, and expressive, using slang such as “based,” “ratio,” “aura,” “peak,” “mogged,” and “girlbosses.” They use exaggerated capitalization and long reactions like “NOOOOOOOOOOOOOOOO,” plus frequent emojis and GIFs. They often address specific friends or bots to get judgments, votes, or validation.

Into: They play or suggest League of Legends, Valorant, Baldur’s Gate 3, Pokémon Emerald, chess, and possibly other games. They discuss ARAM versus normal games, five-stacking Valorant, Nuzlocke Soullink runs, and League’s jungle. They are also interested in anime, films, music, food, Mate, and imaginative lore around “aura” and “Kuronami.”

Reputation: The group associates Til with organizing plans, agenda-pushing, ratio requests, and chaotic banter.
