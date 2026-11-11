import repositoryInstance, { WeatherDataRepository } from './repository.js';
import { WeatherData, WeatherFilter } from './dto.js';
import dayjs from 'dayjs';

export class WeatherService {
  private weatherRepository: WeatherDataRepository;
  constructor() {
    this.weatherRepository = repositoryInstance;
  }

  async addData(data: WeatherData) {
    return this.weatherRepository.insertWeatherData(data);
  }

  async getData(location: string, options: WeatherFilter) {
    const { from, to } = options;
    const data = await this.weatherRepository.getWeatherDataByLocation(
      location
    );
    if (data === null) {
      return null;
    }
    return data.filter((datum) => {
      if (
        from &&
        (dayjs(from).isAfter(datum.date) || dayjs(from).isSame(datum.date))
      ) {
        return false;
      }
      if (to && dayjs(to).isBefore(datum.date)) {
        return false;
      }
      return true;
    });
  }

  async getMean(location: string, options: WeatherFilter) {
    const data = await this.getData(location, options);
    if (data === null) {
      return null;
    }
    const mean =
      data
        .map((datum) => datum.temperature)
        .reduce((acc, current) => acc + current, 0.0) / data.length;

    return mean;
  }

  async getMax(location: string, options: WeatherFilter) {
    const data = await this.getData(location, options);

    if (data === null) {
      return null;
    }
    const mean = data
      .map((datum) => datum.temperature)
      .reduce((acc, current) => Math.max(acc, current), data[0].temperature);

    return mean;
  }

  async getMin(location: string, options: WeatherFilter) {
    const data = await this.getData(location, options);

    if (data === null) {
      return null;
    }
    const mean = data
      .map((datum) => datum.temperature)
      .reduce((acc, current) => Math.min(acc, current), data[0].temperature);

    return mean;
  }
}

export default new WeatherService();
