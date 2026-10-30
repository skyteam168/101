import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver } from './local-storage.driver';
import { OssStorageDriver } from './oss-storage.driver';
import { STORAGE_DRIVER } from './storage.interface';

@Global()
@Module({
  providers: [
    LocalStorageDriver,
    OssStorageDriver,
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService, LocalStorageDriver, OssStorageDriver],
      useFactory: (
        config: ConfigService,
        local: LocalStorageDriver,
        oss: OssStorageDriver,
      ) => (config.get<string>('STORAGE_DRIVER') === 'oss' ? oss : local),
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
