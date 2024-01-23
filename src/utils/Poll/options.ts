import { ApplicationCommandOptionType, CommandInteraction } from "discord.js";

export const commandOptions = [
  {
    name: "description",
    description: "Description for the poll",
    required: true,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "duration",
    description: "poll duration in minutes",
    required: true,
    type: ApplicationCommandOptionType.Integer,
  },
  {
    name: "option1",
    description: "poll option 1",
    required: true,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option2",
    description: "poll option 2",
    required: true,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option3",
    description: "poll option 3",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option4",
    description: "poll option 4",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option5",
    description: "poll option 5",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option6",
    description: "poll option 6",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option7",
    description: "poll option 7",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option8",
    description: "poll option 8",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
  {
    name: "option9",
    description: "poll option 9",
    required: false,
    type: ApplicationCommandOptionType.String,
  },
];

type ReactionEmojiObject = {
  [key: string]: string;
};

export const reactionEmojis: ReactionEmojiObject = {
  "1": "1️⃣",
  "2": "2️⃣",
  "3": "3️⃣",
  "4": "4️⃣",
  "5": "5️⃣",
  "6": "6️⃣",
  "7": "7️⃣",
  "8": "8️⃣",
  "9": "9️⃣",
} as const;

const OPTION_COUNT = Object.keys(reactionEmojis).length;

export function getFilteredOptions(interaction: CommandInteraction) {
  const options = interaction.options;

  const filteredOptions = Array.from({ length: OPTION_COUNT }, (_, i) =>
    options.get(`option${i + 1}`)
  )
    //filter out empty options -> option is not null
    .filter((option) => option)
    .map((option) => option!.value as string);

  return filteredOptions;
}
