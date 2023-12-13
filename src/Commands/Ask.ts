import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import DiscordJS, { ApplicationCommandOptionType } from "discord.js";

type AnswerType = "xmas" | "aprilFools" | "default";

class Ask extends NormalCommandClass {
  name: string = "ask";
  shortcut = "a";
  description: string = "Ask a question";
  options: any = [
    {
      name: "question",
      description: "Question to ask",
      required: true,
      type: ApplicationCommandOptionType.String,
    },
  ];

  reply(interaction: DiscordJS.CommandInteraction): void {
    interaction.reply({
      content:
        interaction.options.get("question", true).value +
        "\n**" +
        this.getContent() +
        "**",
    });
  }

  answers: string[] = [
    "So it would seem.",
    "As I see it, yes.",
    "Don't count on it",
    "It is certain",
    "Affirmative",
    "Most likely",
    "My reply is no",
    "My sources say no.",
    "Outlook not so good",
    "Outlook good",
    "Signs point to yes",
    "Very doubtful.",
    "Without a doubt",
    "Yes.",
    "Yes - definitely.",
    "You may rely on it",
  ];

  xmas_answers = [
    "As merry as a wreath!",
    "It's as certain as Santa!",
    "Ho ho ho! Affirmative!",
    "Outlook not so jolly.",
    "Outlook as bright as Rudolph's nose!",
    "The candy canes say yes!",
    "Very doubtful, like finding a yeti.",
    "Without a doubt, like Christmas morning!",
    "Yes, like cookies for Santa.",
    "Yes - definitely a festive affair.",
    "You may rely on it, like Santa's sleigh!",
    "No, you are on the naughty list!",
    "Yes, you are on the nice list!",
    "Ho ho ho! Yes!",
    "No, get back to work you lousy elf!"
  ];

  aprilfoolsAnswers: string[] = [
    "Ey du Hurensohn",
    "XD IMAGINE THINKING THAT",
    "you are the bot now",
    "KEKW",
    "LMAO YOU STOOPID",
    "bruh fr?",
    "you are lowkey mid",
    "you are lowkey mildly retarded",
    "deez nuts",
    "trump looking ass XD",
    "iq diff XD",
    "gura deadass dog tier",
    "your opinion is trash",
    "go cry in a corner fgt",
    "my man deadass thinks the sun is a planet",
    "fucking donkey",
    "monke brain ask",
    "??????",
    "L + Ratio",
    "No bitches ????",
    "didnt ask",
    "get gud",
    "try coping harder retard",
    "no parents ??",
    "4chan brain",
    "^ negativ iq",
    "small brain",
    "boomer brain XD",
    "tictactoe forehead",
    "no maidens??",
    "^ greentext vibes",
    "french",
    "...",
    "my man has 0 iq but still said facts",
    "facts",
    "trueeee",
    "factual",
    "decent iq moment",
    "first moment of enlightment",
    "sun reflects of yo big ass forehead",
    "nice guess lol",
    "toddler thought",
    "get some bitches",
    "copium",
    "bruh moment",
    "Didnt't ask + Ratio + cringe + you fell off + cope",
    "great argument! however, your mother",
    "*dies of cringe*",
    "dogshit opinion",
    "dogshit brain",
    "you are trolling, no?",
    "skill issue",
    "okaay..",
    "your sigma male card has been revoked",
    "we do a lil trolling",
    "problem?",
    "pathetic",
    "i think my brain just comitted suicide",
    "simp thought",
    "touch some grass",
    "go outside",
    "british teeth",
    "*leaves conversation*",
    "furry vibes",
    "incel moment",
    "commit hero",
    "fuck off twat",
    "discord mod vibes",
    "american brain XD",
    "XD",
    "go apply for ronald mcdonalds position",
  ];

  isAprilFools(): boolean {
    let aprilFoolsDay = {
      month: 3,
      date: 1,
    };
    let now = new Date();
    return (
      now.getMonth() == aprilFoolsDay.month &&
      now.getDate() == aprilFoolsDay.date
    );
  }

  isXmasMonth(): boolean {
    const xmasMonth = 11;
    const xmasDay = 26;
    let now = new Date();
    return now.getMonth() === xmasMonth && now.getDate() < xmasDay;
  }

  getResponse(answerArray: string[]): string {
    return answerArray[Math.floor(Math.random() * answerArray.length)];
  }

  getContentType(): AnswerType {
    let specialOccasion = this.isXmasMonth();
    if (specialOccasion) {
        //50% chance of xmas answer
        return Math.random() < 0.5 ? "xmas" : "default";
    };

    specialOccasion = this.isAprilFools();
    if (specialOccasion) return "aprilFools";

    return "default";
  }

  RESPONSES: Record<AnswerType, string[]> = {
    xmas: this.xmas_answers,
    aprilFools: this.aprilfoolsAnswers,
    default: this.answers,
  };

  getContent(): string {
    const contentType = this.getContentType();
    return this.getResponse(this.RESPONSES[contentType]);
  }
}

export function getInstance() {
  return new Ask();
}
