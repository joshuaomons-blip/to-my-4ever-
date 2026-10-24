import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { Auth, CustomerGuard } from '../auth/guards';
import { AppError } from '../common/errors';
import { AuthContext } from '../common/request-context';
import { DbService } from '../database/db.service';
import { BarRange } from '../market-data/market-data.adapter';
import { MarketDataService } from '../market-data/market-data.service';

class WatchlistDto {
  @ApiProperty() @IsString() @Length(1, 60) name: string;
}
class WatchlistItemDto {
  @ApiProperty() @Matches(/^[A-Z0-9.\-]{1,12}$/) symbol: string;
}

const RANGES: BarRange[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];

@ApiTags('markets')
@Controller('v1')
@UseGuards(CustomerGuard)
export class InstrumentsController {
  constructor(private readonly db: DbService, private readonly md: MarketDataService) {}

  @Get('instruments')
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'assetClass', required: false, enum: ['equity', 'etf'] })
  async search(@Query('q') q?: string, @Query('assetClass') assetClass?: string) {
    const term = (q ?? '').trim().slice(0, 40);
    return this.db.query(
      `SELECT id, symbol, exchange, name, asset_class AS "assetClass", currency, sector, fractionable, is_tradable AS "isTradable"
         FROM instruments
        WHERE ($1 = '' OR symbol ILIKE $1 || '%' OR name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR asset_class = $2)
        ORDER BY (symbol = upper($1)) DESC, symbol LIMIT 50`,
      [term, assetClass && ['equity', 'etf'].includes(assetClass) ? assetClass : null],
    );
  }

  @Get('instruments/:symbol')
  async detail(@Param('symbol') symbol: string) {
    const i = await this.db.one(
      `SELECT id, symbol, exchange, name, asset_class AS "assetClass", currency, isin, sector, description, fractionable,
              is_tradable AS "isTradable" FROM instruments WHERE symbol = $1 LIMIT 1`,
      [symbol.toUpperCase()],
    );
    if (!i) throw new AppError('NOT_FOUND', 'Instrument not found', 404);
    const corporateActions = await this.db.query(
      'SELECT type, ex_date AS "exDate", pay_date AS "payDate", details FROM corporate_actions WHERE instrument_id = $1 ORDER BY ex_date DESC NULLS LAST LIMIT 20',
      [(i as { id: string }).id],
    );
    return { ...i, corporateActions };
  }

  @Get('quotes/:symbol')
  quote(@Param('symbol') symbol: string) {
    return this.md.quote(symbol.toUpperCase());
  }

  @Get('quotes')
  @ApiQuery({ name: 'symbols', description: 'Comma separated, max 50' })
  async quotes(@Query('symbols') symbols = '') {
    const list = [...new Set(symbols.toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s)))].slice(0, 50);
    return Promise.all(list.map((s) => this.md.quote(s)));
  }

  @Get('bars/:symbol')
  bars(@Param('symbol') symbol: string, @Query('range') range: BarRange = '1M') {
    if (!RANGES.includes(range)) throw new AppError('VALIDATION_FAILED', 'Invalid range', 400);
    return this.md.bars(symbol.toUpperCase(), range);
  }

  @Get('watchlists')
  async watchlists(@Auth() a: AuthContext) {
    await this.db.query("INSERT INTO watchlists (user_id, name) VALUES ($1, 'My watchlist') ON CONFLICT DO NOTHING", [a.subjectId]);
    const lists = await this.db.query<{ id: string; name: string }>('SELECT id, name FROM watchlists WHERE user_id = $1 ORDER BY created_at', [a.subjectId]);
    const items = await this.db.query<{ watchlist_id: string; symbol: string; name: string; asset_class: string }>(
      `SELECT wi.watchlist_id, i.symbol, i.name, i.asset_class FROM watchlist_items wi JOIN instruments i ON i.id = wi.instrument_id
        JOIN watchlists w ON w.id = wi.watchlist_id WHERE w.user_id = $1 ORDER BY wi.added_at`,
      [a.subjectId],
    );
    return lists.map((l) => ({ ...l, items: items.filter((i) => i.watchlist_id === l.id).map(({ watchlist_id: _w, ...rest }) => rest) }));
  }

  @Post('watchlists')
  async createWatchlist(@Auth() a: AuthContext, @Body() dto: WatchlistDto) {
    const count = await this.db.one<{ n: string }>('SELECT count(*)::text AS n FROM watchlists WHERE user_id = $1', [a.subjectId]);
    if (Number(count!.n) >= 10) throw new AppError('LIMIT_REACHED', 'Maximum of 10 watchlists', 422);
    return this.db.one('INSERT INTO watchlists (user_id, name) VALUES ($1,$2) RETURNING id, name', [a.subjectId, dto.name.trim()]);
  }

  private async ownList(userId: string, id: string) {
    const w = await this.db.one('SELECT id FROM watchlists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!w) throw new AppError('NOT_FOUND', 'Watchlist not found', 404);
  }

  @Post('watchlists/:id/items')
  @HttpCode(204)
  async addItem(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WatchlistItemDto) {
    await this.ownList(a.subjectId, id);
    const i = await this.db.one<{ id: string }>('SELECT id FROM instruments WHERE symbol = $1 LIMIT 1', [dto.symbol]);
    if (!i) throw new AppError('NOT_FOUND', 'Instrument not found', 404);
    await this.db.query('INSERT INTO watchlist_items (watchlist_id, instrument_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, i.id]);
  }

  @Delete('watchlists/:id/items/:symbol')
  @HttpCode(204)
  async removeItem(@Auth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('symbol') symbol: string) {
    await this.ownList(a.subjectId, id);
    await this.db.query('DELETE FROM watchlist_items WHERE watchlist_id = $1 AND instrument_id = (SELECT id FROM instruments WHERE symbol = $2 LIMIT 1)', [id, symbol.toUpperCase()]);
  }
}
