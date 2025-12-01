const axios = require('axios'); // legacy way
const c = require('ansi-colors');
const fs = require("fs");
const { parse } = require("csv-parse");
const path = require('path');
const cheerio = require('cheerio')
const { DateTime } = require('luxon');
const ncp = require("copy-paste");
const prompt = require('prompt-sync')();
const MOVIES_CSV_PATH = path.join(process.cwd(), 'movies.csv');
 
const sunday = DateTime.now().minus({ weeks: 1}).endOf('week');
const friday = sunday.minus({ days: 2});
const boxOfficeMojoUrl = `https://www.boxofficemojo.com/weekend/${sunday.year}W${sunday.weekNumber.toString().padStart(2, '0')}/`;

console.log(`Getting data from Box Office Mojo: ${boxOfficeMojoUrl}`);

axios.get(boxOfficeMojoUrl)
  .then(function (response) {
    // handle success
	parseHtml(response.data);
  })
  .catch(function (error) {
    // handle error
	console.log(c.red('Error:'), c.white(error));
  });

function parseHtml(html) {
	console.log(c.green('Got data'));

	const $ = cheerio.load(html)
	var boxOfficeWinners = []
	$('tr').map(function(i, row) {
		if (i == 0 || i > 5) {
			return;
		}
		const title = $(row).find('a.a-link-normal:first').text();
		const gross = $(row).find('td.mojo-field-type-money:first').text();
		boxOfficeWinners.push({
			title: title,
			rank: i,
			gross: gross,
		});
	});

	console.log(c.green('Got weekend box office winners'));
	getMoviesFromCsv(boxOfficeWinners);
}

function getMoviesFromCsv(boxOfficeWinners) {
	const movies = [];
	fs.createReadStream(MOVIES_CSV_PATH)
		.pipe(parse({ columns: true }))
		.on("data", function (row) {
			movies.push(row);
		})
		.on("end", function () {
			parseMovies(movies, boxOfficeWinners);
		});
}

async function parseMovies(movies, boxOfficeWinners) {
	const outputData = [];
	boxOfficeWinners.forEach(async (boxOfficeWinner) => {
		let matchedMovie = movies.find((movie) => movie.title === boxOfficeWinner.title);
		if (!matchedMovie) {
			matchedMovie = await promptForMovieData(boxOfficeWinner);
			saveNewMovieToCsv(matchedMovie);
		}
		outputData.push({
			title: boxOfficeWinner.title,
			rank: boxOfficeWinner.rank,
			gross: boxOfficeWinner.gross,
			image_url: matchedMovie.image_url,
			imdb_id: matchedMovie.imdb_id,
		});
	});
	formatOutputDataForSlack(outputData);
}

function formatOutputDataForSlack(outputData) {
	let blocks = outputData.map((movie) => ({
		type: 'section',
		text: {
			type: 'mrkdwn',
			text: getRankIcon(movie.rank)+ ` <https://www.imdb.com/title/${movie.imdb_id}/|${movie.title}> _(${movie.gross})_`,
		},
		accessory: {
			type: 'image',
			image_url: `https://images.weserv.nl/?h=88&w=88&fit=contain&url=${movie.image_url}`,
			alt_text: movie.title,
		},
	}));
	blocks.unshift({
		"type": "header",
		"text": {
			"type": "plain_text",
			"text": `:film_projector: Weekend Box-Office Winners (${friday.toFormat('dd LLL')} - ${sunday.toFormat('dd LLL')})`,
			"emoji": true
		}
	});
	ncp.copy(JSON.stringify({ blocks }));
	console.log(c.green('Data copied to clipboard'));
}

function getRankIcon(rank) {
	switch (rank) {
		case 1:
			return ':one:';
		case 2:
			return ':two:';
		case 3:
			return ':three:';
		case 4:
			return ':four:';
		case 5:
			return ':five:';
		default:
			return '';
	}
}

async function promptForMovieData(boxOfficeWinner) {
	const imdbSearchUrl = `https://www.google.com/search?q=site%3Aimdb.com+${encodeURIComponent(boxOfficeWinner.title)}`;
	const imdbId = prompt(`Enter the IMDB ID for ${boxOfficeWinner.title} (${imdbSearchUrl}): `);
	const imageSearchUrl = `https://www.google.com/search?q=site%3Athemoviedb.org+${encodeURIComponent(boxOfficeWinner.title)}`;
	const imageUrl = prompt(`Enter the image URL for ${boxOfficeWinner.title} (${imageSearchUrl}): `);
	return { title: boxOfficeWinner.title, imdb_id: imdbId, image_url: imageUrl };
}

function saveNewMovieToCsv(movie) {
	const headers = ['title', 'imdb_id', 'image_url'];
	const csv = headers.map((header) => movie[header]).join(',') + '\n';
	fs.appendFileSync(MOVIES_CSV_PATH, csv);
}
