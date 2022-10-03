import { Movie } from "./fetchMovieData";

export function getRandomMovie(movieList: Movie[]): Movie {
  let randIndex = Math.floor(Math.random() * movieList.length - 1);
  let randMovie = movieList[randIndex];
  /*while (!replyStr.includes(randMovie.name)) {
    randIndex = Math.floor(Math.random() * movieList.length);
    randMovie = movieList[randIndex];
  }*/
  return randMovie;
}
