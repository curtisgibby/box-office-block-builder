const axios = require('axios'); // legacy way
const c = require('ansi-colors');
const fs = require("fs");
const { parse } = require("csv-parse");
const path = require('path');
const cheerio = require('cheerio')
const { DateTime } = require('luxon');
const ncp = require("copy-paste");
const prompt = require('prompt-sync')();
const { MovieDb } = require('moviedb-promise');
const MOVIES_CSV_PATH = path.join(process.cwd(), 'movies.csv');

let moviedb = null;
try {
	const tmdbConfig = require('./tmdb-config.json');
	if (tmdbConfig && tmdbConfig.apiKey) {
		moviedb = new MovieDb(tmdbConfig.apiKey);
	}
} catch (error) {
	console.log(c.yellow('Warning:'), c.white('TMDB integration disabled. Check tmdb-config.json and moviedb-promise installation.'));
}

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
		.pipe(parse({ columns: true, relax_column_count: true }))
		.on("data", function (row) {
			movies.push(row);
		})
		.on("end", function () {
			parseMovies(movies, boxOfficeWinners);
		});
}

async function parseMovies(movies, boxOfficeWinners) {
	const outputData = [];
	for (const boxOfficeWinner of boxOfficeWinners) {
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
			rt_url: matchedMovie.rt_url,
			rt_tomatometer_score: matchedMovie.rt_tomatometer_score,
			rt_tomatometer_status: matchedMovie.rt_tomatometer_status,
			rt_popcornmeter_score: matchedMovie.rt_popcornmeter_score,
			rt_popcornmeter_status: matchedMovie.rt_popcornmeter_status,
		});
	}
	formatOutputDataForSlack(outputData);
}

function formatOutputDataForSlack(outputData) {
	let blocks = outputData.map((movie) => ({
		type: 'section',
		text: {
			type: 'mrkdwn',
			text: getRankIcon(movie.rank)+ ` <https://www.imdb.com/title/${movie.imdb_id}/|${movie.title}> _(${movie.gross})_` + getRottenTomatoesText(movie),
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

function getRottenTomatoesText(movie) {
	if (!movie.rt_url) {
		return '';
	}

	const parts = [];
	if (movie.rt_tomatometer_status && movie.rt_tomatometer_score) {
		const icon = getTomatometerIcon(movie.rt_tomatometer_status);
		parts.push(`${icon} ${movie.rt_tomatometer_score}%`);
	}
	if (movie.rt_popcornmeter_status && movie.rt_popcornmeter_score) {
		const icon = getPopcornmeterIcon(movie.rt_popcornmeter_status);
		parts.push(`${icon} ${movie.rt_popcornmeter_score}%`);
	}
	if (parts.length === 0) {
		return `\n<${movie.rt_url}|Rotten Tomatoes>`;
	}
	return `\n<${movie.rt_url}|${parts.join(' ')}>`;
}

function getTomatometerIcon(status) {
	switch (status) {
		case 'rotten':
			return ':rotten-tomatoes-rotten-splat:';
		case 'fresh':
			return ':rotten-tomatoes-fresh-tomato:';
		case 'certified-fresh':
			return ':rotten-tomatoes-certified-fresh:';
		default:
			return '';
	}
}

function getPopcornmeterIcon(status) {
	switch (status) {
		case 'stale':
			return ':rotten-tomatoes-stale-popcorn:';
		case 'hot':
			return ':rotten-tomatoes-hot-popcorn:';
		case 'verified-hot':
			return ':rotten-tomatoes-verified-hot:';
		default:
			return '';
	}
}

function promptForChoice(message, options) {
	while (true) {
		console.log(message);
		options.forEach((option, index) => {
			console.log(c.blue(`${index + 1}`) + ` ${option}`);
		});
		const answer = prompt(`Enter 1-${options.length}: `);
		const index = parseInt(answer, 10);
		if (!Number.isNaN(index) && index >= 1 && index <= options.length) {
			return options[index - 1];
		}
		console.log('Invalid choice, please try again.');
	}
}

async function findMovieInTmdb(boxOfficeWinner) {
	if (!moviedb) {
		return null;
	}
	try {
		const searchResponse = await moviedb.searchMovie({ query: boxOfficeWinner.title });
		const results = searchResponse && searchResponse.results ? searchResponse.results : [];
		if (!results.length) {
			return null;
		}
		let chosenMovie = null;
		if (results.length === 1) {
			chosenMovie = results[0];
		} else {
			const options = results.map((movie) => {
				const releaseDate = movie.release_date || 'unknown release date';
				return `${movie.title} (${releaseDate})`;
			});
			const selected = promptForChoice(`Select the matching movie for ${boxOfficeWinner.title}:`, options);
			const selectedIndex = options.indexOf(selected);
			chosenMovie = results[selectedIndex === -1 ? 0 : selectedIndex];
		}
		const externalIds = await moviedb.movieExternalIds({ id: chosenMovie.id });
		const imdbId = externalIds && externalIds.imdb_id ? externalIds.imdb_id : null;
		const imageUrl = chosenMovie.poster_path ? `https://image.tmdb.org/t/p/w92${chosenMovie.poster_path}` : null;
		return { imdbId, imageUrl };
	} catch (error) {
		return null;
	}
}

async function scrapeRottenTomatoesScores(rtUrl) {
	if (!rtUrl) {
		return null;
	}
	try {
		const response = await axios.get(rtUrl, {
			headers: {
				// A basic User-Agent can help avoid some simplistic bot blocks
				'User-Agent': 'box-office-block-builder/1.0',
			},
		});
		const html = response.data;
		const $ = cheerio.load(html);
		
		// Most relevant score elements live inside <media-scorecard>.
		const scorecard = $('media-scorecard').first();
		const scope = scorecard && scorecard.length ? scorecard : $.root();
		
		let tomatometerScore = null;
		let tomatometerStatus = null;
		let popcornmeterScore = null;
		let popcornmeterStatus = null;
		
		// Preferred approach: use dedicated score-icon and rt-text elements.
		const criticsIcon = scope.find('score-icon-critics').first();
		if (criticsIcon && criticsIcon.length) {
			const sentiment = (criticsIcon.attr('sentiment') || '').toUpperCase();
			const certified = (criticsIcon.attr('certified') || '').toLowerCase() === 'true';
			if (sentiment === 'NEGATIVE') {
				tomatometerStatus = 'rotten';
			} else if (sentiment === 'POSITIVE' && certified) {
				tomatometerStatus = 'certified-fresh';
			} else if (sentiment === 'POSITIVE') {
				tomatometerStatus = 'fresh';
			}
		}
		const criticsText = scope.find('rt-text[slot="criticsScore"], rt-text[slot^="criticsScore"]').first().text();
		if (criticsText) {
			const match = criticsText.match(/(\d+)/);
			if (match) {
				tomatometerScore = match[1];
			}
		}
		
		const audienceIcon = scope.find('score-icon-audience').first();
		if (audienceIcon && audienceIcon.length) {
			const sentiment = (audienceIcon.attr('sentiment') || '').toUpperCase();
			const certified = (audienceIcon.attr('certified') || '').toLowerCase() === 'true';
			if (sentiment === 'NEGATIVE') {
				popcornmeterStatus = 'stale';
			} else if (sentiment === 'POSITIVE' && certified) {
				popcornmeterStatus = 'verified-hot';
			} else if (sentiment === 'POSITIVE') {
				popcornmeterStatus = 'hot';
			}
		}
		const audienceText = scope.find('rt-text[slot="audienceScore"], rt-text[slot^="audienceScore"]').first().text();
		if (audienceText) {
			const match = audienceText.match(/(\d+)/);
			if (match) {
				popcornmeterScore = match[1];
			}
		}

		return {
			tomatometerScore: tomatometerScore || null,
			tomatometerStatus: tomatometerStatus || null,
			popcornmeterScore: popcornmeterScore || null,
			popcornmeterStatus: popcornmeterStatus || null,
		};
	} catch (error) {
		return null;
	}
}

async function promptForMovieData(boxOfficeWinner) {
	const imdbSearchUrl = `https://www.google.com/search?q=site%3Aimdb.com+${encodeURIComponent(boxOfficeWinner.title)}`;
	const imageSearchUrl = `https://www.google.com/search?q=site%3Athemoviedb.org+${encodeURIComponent(boxOfficeWinner.title)}`;
	let imdbId;
	let imageUrl;

	const tmdbData = await findMovieInTmdb(boxOfficeWinner);
	if (tmdbData) {
		if (tmdbData.imdbId) {
			imdbId = tmdbData.imdbId;
		}
		if (tmdbData.imageUrl) {
			imageUrl = tmdbData.imageUrl;
		}
	}
	if (!imdbId) {
		imdbId = prompt(`Enter the IMDB ID for ${boxOfficeWinner.title} (${imdbSearchUrl}): `);
	}
	if (!imageUrl) {
		imageUrl = prompt(`Enter the image URL for ${boxOfficeWinner.title} (${imageSearchUrl}): `);
	}
	const rtSearchUrl = `https://www.google.com/search?q=site%3Arottentomatoes.com+${encodeURIComponent(boxOfficeWinner.title)}`;
	const rtUrl = prompt(`Enter the Rotten Tomatoes URL for ${boxOfficeWinner.title} (${rtSearchUrl}): `);
	let tomatometerScore;
	let tomatometerStatus;
	let popcornmeterScore;
	let popcornmeterStatus;

	const scrapedRt = await scrapeRottenTomatoesScores(rtUrl);
	if (scrapedRt) {
		if (scrapedRt.tomatometerScore) {
			tomatometerScore = scrapedRt.tomatometerScore;
		}
		if (scrapedRt.tomatometerStatus) {
			tomatometerStatus = scrapedRt.tomatometerStatus;
		}
		if (scrapedRt.popcornmeterScore) {
			popcornmeterScore = scrapedRt.popcornmeterScore;
		}
		if (scrapedRt.popcornmeterStatus) {
			popcornmeterStatus = scrapedRt.popcornmeterStatus;
		}
	}
	if (!tomatometerScore) {
		tomatometerScore = prompt(`Enter the Rotten Tomatoes TOMATOMETER score (critics %) for ${boxOfficeWinner.title}: `);
	}
	if (!tomatometerStatus) {
		tomatometerStatus = promptForChoice(
			`Select the Rotten Tomatoes TOMATOMETER status for ${boxOfficeWinner.title}:`,
			['rotten', 'fresh', 'certified-fresh']
		);
	}
	if (!popcornmeterScore) {
		popcornmeterScore = prompt(`Enter the Rotten Tomatoes POPCORNMETER score (audience %) for ${boxOfficeWinner.title}: `);
	}
	if (!popcornmeterStatus) {
		popcornmeterStatus = promptForChoice(
			`Select the Rotten Tomatoes POPCORNMETER status for ${boxOfficeWinner.title}:`,
			['stale', 'hot', 'verified-hot']
		);
	}
	return {
		title: boxOfficeWinner.title,
		imdb_id: imdbId,
		image_url: imageUrl,
		rt_url: rtUrl,
		rt_tomatometer_score: tomatometerScore,
		rt_tomatometer_status: tomatometerStatus,
		rt_popcornmeter_score: popcornmeterScore,
		rt_popcornmeter_status: popcornmeterStatus,
	};
}

function saveNewMovieToCsv(movie) {
	const headers = [
		'title',
		'imdb_id',
		'image_url',
		'rt_url',
		'rt_tomatometer_score',
		'rt_tomatometer_status',
		'rt_popcornmeter_score',
		'rt_popcornmeter_status',
	];
	const csv = headers.map((header) => movie[header]).join(',') + '\n';
	fs.appendFileSync(MOVIES_CSV_PATH, csv);
}
