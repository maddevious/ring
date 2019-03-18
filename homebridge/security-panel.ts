import { BaseAccessory } from './base-accessory'
import { AlarmDevice, AlarmDeviceData, AlarmState } from '../api'
import { distinctUntilChanged } from 'rxjs/operators'
import { HAP, hap } from './hap'
import { RingAlarmPlatformConfig } from './config'

export class SecurityPanel extends BaseAccessory {
  private targetState: any
  private alarmStates: AlarmState[] = this.config.alarmOnEntryDelay
    ? ['entry-delay', 'burglar-alarm']
    : ['burglar-alarm']

  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingAlarmPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    this.device.onData
      .pipe(distinctUntilChanged((a, b) => a.mode === b.mode))
      .subscribe(data => {
        this.targetState = this.getTargetState(data)
      })

    this.registerCharacteristic(
      Characteristic.SecuritySystemCurrentState,
      Service.SecuritySystem,
      data => {
        const state = this.getCurrentState(data)

        if (state === this.targetState) {
          this.targetState = undefined
        }

        return state
      }
    )

    this.registerCharacteristic(
      Characteristic.SecuritySystemTargetState,
      Service.SecuritySystem,
      data => this.getTargetState(data),
      value => this.setTargetState(value)
    )
  }

  getCurrentState({ mode, alarmInfo }: AlarmDeviceData) {
    const {
      Characteristic: { SecuritySystemCurrentState: State }
    } = hap

    if (alarmInfo && this.alarmStates.includes(alarmInfo.state)) {
      return State.ALARM_TRIGGERED
    }

    switch (mode) {
      case 'all':
        return State.AWAY_ARM
      case 'some':
        return State.STAY_ARM
      case 'none':
        return State.DISARMED
      default:
        return State.DISARMED
    }
  }

  setTargetState(state: any) {
    const {
        Characteristic: { SecuritySystemTargetState: State }
      } = hap,
      { alarm, data } = this.device

    if (state === State.NIGHT_ARM) {
      state = State.STAY_ARM
      // Ring doesn't have night mode, so switch over to stay mode
      setTimeout(() => {
        this.getService(hap.Service.SecuritySystem)
          .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
          .updateValue(state)
      }, 100)
    }

    if (state === this.getCurrentState(data)) {
      this.targetState = undefined
      return
    }

    this.targetState = state

    if (state === State.AWAY_ARM) {
      this.logger.info(`Arming (Away) ${this.device.name}`)
      alarm.armAway()
    } else if (state === State.DISARM) {
      this.logger.info(`Disarming ${this.device.name}`)
      alarm.disarm()
    } else {
      this.logger.info(`Arming (Home) ${this.device.name}`)
      alarm.armHome()
    }
  }

  getTargetState(data: AlarmDeviceData) {
    return this.targetState || this.getCurrentState(data)
  }
}