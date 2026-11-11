# WeatherTrack Pro Backend

This is the core backend of WeatherTrack Pro application.

This project is responsible for storing and exposing weather data as well as producing different data analysis.

## Usage

Configuration settings can be set per environment under the `/config` directory. See [`config` documentation](https://www.npmjs.com/package/config).

- Run the project

  ```sh
  npm start
  ```

- Run the project in watch/inspect mode

  ```sh
  npm run start:watch
  ```

## API Description

### Data management

This route is not publicly exposed and is used only by the internal robots responsible for retreiving and uploading weather data.

- `POST` `/weather/data`

  body example:

  ```json
  {
    "location": "Lyon",
    "date": "2023-12-24T23:00:00.000Z",
    "temperature": 25,
    "humidity": 40
  }
  ```

### Data retrieval

- `GET` `/weather/data/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  examlple query:

  ```sh
  curl localhost:3000/weather/data/Lyon\?from=2023-12-22\&to=2023-12-25
  ```

  response example:

  ```json
  [
    {
      "location": "Lyon",
      "date": "2023-12-22T23:00:00.000Z",
      "temperature": 27,
      "humidity": 40
    },
    {
      "location": "Lyon",
      "date": "2023-12-24T23:00:00.000Z",
      "temperature": 25,
      "humidity": 40
    }
  ]
  ```

### Data analysis

- `GET` `/weather/avg/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  examlple query:

  ```sh
  curl localhost:3000/weather/avg/Lyon?from=2023-12-22&to=2023-12-25
  ```

  response example:

  ```json
  { "avg": 24.166666666666668 }
  ```

- `GET` `/weather/max/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  examlple query:

  ```sh
  curl localhost:3000/weather/max/Lyon?from=2023-12-22
  ```

  response example:

  ```json
  { "max": 27 }
  ```

- `GET` `/weather/min/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  examlple query:

  ```sh
  curl localhost:3000/weather/min/Lyon\?to=2023-12-25
  ```

  response example:

  ```json
  { "min": 23 }
  ```

## Locally running infrastructure dependencies

### `postgres:16`

```sh
docker run --name weather-db \
 -e POSTGRES_USER=WeatherTrack \
 -e POSTGRES_PASSWORD=mysecretpassword \
 -e POSTGRES_DB=WeatherTrack \
 -p 5432:5432 \
 -d \
 postgres:16-alpine
```
