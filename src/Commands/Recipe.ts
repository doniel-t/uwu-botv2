import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { getRecipeString } from '../utils/Recipes/fetchRecipes';



class Recipe extends NormalCommandClass {
    name = 'recipe';
    description = 'Give me a list of ingredients and I will give you recipes';
    options = [
        {
            name: 'ingredients',
            description: 'Your ingredients',
            required: true,
            type: ApplicationCommandOptionType.String,
        }
    ]

    async reply(interaction: CommandInteraction): Promise<void> {
        const replyString = await this.getContent(interaction);
        interaction.reply({content: replyString});
    }

    //returns the string response for the command
    async getContent(interaction: CommandInteraction): Promise<string> {
        const ingredients = interaction.options.get("ingredients", true).value as string;
        const recipeString = await getRecipeString(ingredients);
        return recipeString;
        
    }
}

export function getInstance() { return new Recipe() };