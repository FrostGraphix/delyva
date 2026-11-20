import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db } from '../../shared/database/database.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { AddressesController } from './api/addresses.controller.js';
import { CreateAddress } from './application/create-address.use-case.js';
import { DeleteAddress } from './application/delete-address.use-case.js';
import { GeoService } from './application/geo.service.js';
import { ListAddresses } from './application/list-addresses.query.js';
import type { Clock, EtaProvider } from './application/ports.js';
import { UpdateAddress } from './application/update-address.use-case.js';
import { LAGOS_ETA_POLICY } from './domain/eta.js';
import { DrizzleAddressRepository } from './infrastructure/drizzle-address.repository.js';
import {
  GoogleDistanceMatrixEtaProvider,
  HaversineEtaProvider,
} from './infrastructure/eta.providers.js';
import { PostgisZoneRepository } from './infrastructure/postgis-zone.repository.js';

const ETA = Symbol('ETA');
const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

function etaFor(env: Env): EtaProvider {
  const haversine = new HaversineEtaProvider(LAGOS_ETA_POLICY);
  if (env.ETA_PROVIDER !== 'google') return haversine;
  return new GoogleDistanceMatrixEtaProvider({
    apiKey: env.GOOGLE_MAPS_API_KEY,
    timeoutMs: 2_000,
    fallback: haversine,
  });
}

/** Geo bounded context: addresses, delivery zones (PostGIS), distance and ETA. */
@Module({
  imports: [IdentityModule],
  controllers: [AddressesController],
  providers: [
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [JoseAccessTokenSigner, ENV],
      useFactory: (signer: JoseAccessTokenSigner, env: Env) =>
        new JoseAccessTokenVerifier({
          key: signer.verificationKey,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    AuthGuard,
    { provide: ETA, inject: [ENV], useFactory: etaFor },
    {
      provide: DrizzleAddressRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleAddressRepository(db),
    },
    {
      provide: GeoService,
      inject: [DB, ETA],
      useFactory: (db: Db, eta: EtaProvider) =>
        new GeoService({ zones: new PostgisZoneRepository(db), eta, policy: LAGOS_ETA_POLICY }),
    },
    {
      provide: ListAddresses,
      inject: [DrizzleAddressRepository],
      useFactory: (r: DrizzleAddressRepository) => new ListAddresses(r),
    },
    {
      provide: CreateAddress,
      inject: [DrizzleAddressRepository],
      useFactory: (r: DrizzleAddressRepository) =>
        new CreateAddress({ addresses: r, clock: systemClock }),
    },
    {
      provide: UpdateAddress,
      inject: [DrizzleAddressRepository],
      useFactory: (r: DrizzleAddressRepository) => new UpdateAddress(r),
    },
    {
      provide: DeleteAddress,
      inject: [DrizzleAddressRepository],
      useFactory: (r: DrizzleAddressRepository) => new DeleteAddress(r),
    },
  ],
  exports: [GeoService],
})
export class GeoModule {}
