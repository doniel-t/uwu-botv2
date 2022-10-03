export function getMovieName(movieSplit: string): string {
  const searchTerm = 'data-qa="discovery-media-list-item-title">';
  const nameIndex = movieSplit.indexOf(searchTerm) + searchTerm.length;
  const stringAfterName = movieSplit.substring(nameIndex);
  const nameEndIndex = stringAfterName.indexOf("<");
  return stringAfterName.substring(0, nameEndIndex).trim();
}

export function getScore(movieSplit: string): number {
  const searchTerm = "audiencescore=";
  const scoreIndex = movieSplit.indexOf(searchTerm) + searchTerm.length + 1;
  const scoreString = movieSplit.substring(scoreIndex, scoreIndex + 2);
  return Number(scoreString);
}

export function sanitizeHTML(name: string): string {
  return name.replace("&#39;", "'").replace("&amp;", '');
}
