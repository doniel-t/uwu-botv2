import { users } from "./initUsers";

export const getUserById = (id: string) => {
  return users.find((user) => user.discordId === id);
};

export const getUserByName = (name: string) => {
  return users.find((user) => isSimilar(user.name.toLowerCase(), name.toLowerCase()));
};

function isSimilar(str1: string, str2: string) {
  return levenshtein(str1, str2) < 3;
}

function levenshtein(str1: string, str2: string) {
  const matrix = Array.from({ length: str1.length + 1 }, () => Array(str2.length + 1).fill(0));
  for (let i = 0; i <= str1.length; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[str1.length][str2.length];
}
