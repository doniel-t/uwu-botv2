import * as dotenv from "dotenv";

type APIRecipeResponse = {
    recipe: Recipe
}

type Recipe = {
    label: string
    image: string
    url: string
};

async function getRecipes(recipeIngredient : string): Promise<Recipe[]> {

    dotenv.config({
        path: "secrets/.env"
    });

    if (!process.env.RECIPE_APP_ID || !process.env.RECIPE_APP_TOKEN) {
        return [];
    }

    if(!recipeIngredient) {
        return [];
    }

    const appID = process.env.RECIPE_APP_ID
    const appKEY = process.env.RECIPE_APP_TOKEN

    const baseUrl = "https://api.edamam.com/search"
    const params = new URLSearchParams({
        app_id: appID,
        app_key: appKEY,
        q: recipeIngredient
    });

    const res = await fetch(`${baseUrl}?${params}`)
    const data = await res.json();
    const recipes = data.hits;
    const wantedRecipes : Recipe[] = [];

    recipes.forEach((recipe: APIRecipeResponse) => {
        const { label, image, url } = recipe.recipe;
        wantedRecipes.push({ label, image, url })
    })

    return wantedRecipes;
}

export async function getRecipeString(recipeIngredient : string): Promise<string> {
    const recipes = await getRecipes(recipeIngredient);
    if(recipes.length === 0) {
        return "No recipes found!";
    }
    let contentString = "";
    recipes.forEach((recipe: Recipe) => {
        const { label, image, url } = recipe;
        contentString += `**${label}**\n${url}\n\n`;
    })
    return contentString;
}
