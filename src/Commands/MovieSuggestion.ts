import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { sanitizeHTML } from "../utils/Movie/parseHTML";
import { getRandomMovie } from "../utils/Movie/randMovie";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { fetchMoviesByGenre } from "../utils/Movie/fetchMovieData";

class MovieSuggestion extends NormalCommandClass {
  name: string = "movie_suggestion";
  description: string = "movie thing";
  options: any = [
    {
      name: "genre",
      description: "which genre you want to get suggested",
      required: true,
      type: ApplicationCommandOptionType.String,
    },
    {
      name: "min_rating",
      description: "lowest allowed score",
      required: true,
      type: ApplicationCommandOptionType.Number,
    },
    {
      name: "theatre_movie_suggestions",
      description: "should the movie be in theatre (true) or online (false)",
      required: true,
      type: ApplicationCommandOptionType.Boolean,
    },
  ];

  async reply(interaction: DiscordJS.CommandInteraction): Promise<void> {
    await interaction.reply({
      content: "Hold on my hosts' internet is dogshit",
    });
    const content = await this.createString(interaction);
    await interaction.editReply({ content: content }).catch((err: Error) => {
      console.log(err);
    });
  }

  async createString(
    interaction: DiscordJS.CommandInteraction
  ): Promise<string> {
    let limit = 10; //limits the reply amount
    const content = await fetchMoviesByGenre(
      String(interaction.options.get("genre")?.value),
      Number(interaction.options.get("min_rating")?.value),
      5,
      Boolean(interaction.options.get("theadre_movie_suggestions")?.value)
    );

    if (limit > content.length) limit = content.length;
    let replyString: string = limit + " random suggestions:";
    for (let i = 0; i < limit; i++) {
      const randMovie = getRandomMovie(content);
      if(!randMovie) continue;
      replyString +=
        "\n" + sanitizeHTML(randMovie.name) + ", " + randMovie.score;
    }
    return replyString ? replyString : 'Error: No movie was found';
  }
}

export function getInstance() {
  return new MovieSuggestion();
}
