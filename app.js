const fs = require('fs');
const axios = require('axios');
const moment = require('moment');
const express = require('express');
const cache = require('memory-cache');
const CsvReadableStream  = require('csv-reader');

const app = express();
const config = {
    port: 8000,
    defaultPageSize: 20,
    departureLimit: 5,
    cacheTime: 30,
};

/**
 * Parsing and reading of the CSV data
 */
const stations = [];
fs.createReadStream('./bahnhof.csv', 'utf8')
    .pipe(CsvReadableStream({
        skipHeader: true,
    }))
    .on('data', row => {
        stations.push({
            id: row[0],
            name: row[1],
        });
    })
    .on('end', () => {
        console.log('Train station data loaded!');
    });

/**
 * API Endpoints
 */
app.get('/', (req, res) => {
    const { 
        page = 1, 
        limit = config.defaultPageSize,
    } = req.query;

    const paginatedStations = stations.slice((page - 1) * limit, page * limit)

    return res.send({
        page: Number(page),
        pageSize: Number(limit),
        totalPages: Math.ceil(stations.length / limit),
        totalCount: stations.length,
        resultsCount: paginatedStations.length,
        data: paginatedStations,
    });
});

app.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (Number(id) === NaN) {
        return res.send('Invalid station ID').status(400);
    }

    const stationCache = cache.get(`station_${id}`);
    if (stationCache) {
        return res.send(stationCache);
    }

    const station = stations.find(s => s.id === id);
    
    try {
        const result = await axios.get(`https://transport.opendata.ch/v1/stationboard?id=${id}&limit=${config.departureLimit}`)
        const { stationboard } = result.data;

        const response = {
            ...station,
            departures: stationboard.map(dep => ({
                name: dep.name,
                to: dep.to,
                platform: dep.stop.platform,
                departureTime: dep.stop.departure,
                departingIn: moment().to(dep.stop.departure),
            })),
        };

        cache.put(`station_${id}`, response, config.cacheTime * 1000);

        return res.send(response);
    } catch (err) {
        return res.send('An error occured').status(500);
    }
});

app.listen(config.port, () => console.log(`API running on port ${config.port}`));
