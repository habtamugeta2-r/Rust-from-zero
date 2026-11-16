@id embedded-iot
@part def
@title Embedded Systems and IoT
@short Embedded and IoT
@level advanced
@time 95
@learn Write `no_std` firmware with `core`/`alloc` and a panic handler | Use `embedded-hal` 1.0 traits across STM32, ESP32, nRF and RP2040 | Build async and interrupt-driven firmware with Embassy and RTIC | Drive GPIO, buses, DMA, timers, displays, USB and CAN | Connect devices with MQTT, CoAP, LoRaWAN and BLE, and update them safely

Embedded Rust runs on microcontrollers with kilobytes of RAM, no operating
system and a hard real-time budget. The language's lack of a garbage collector,
its fixed layouts and its ownership model fit that world unusually well. The
ecosystem is organised around portable traits (`embedded-hal`), concrete
hardware crates (`stm32-hal`, `esp-hal`, `rp-hal`), async executors (Embassy),
and real-time frameworks (RTIC). This chapter covers the full path from a
`no_std` binary to a connected, updateable device. The library's
[games-and-embedded survey](#games-embedded) is a gentle introduction; chapter
D3 covers the systems primitives used here.

:::analogy A microcontroller is a small factory
A server can pause, allocate, retry and let an operator fix things. A
microcontroller has one shift, a fixed amount of shelf space and a machine that
must respond to a sensor within microseconds. Every byte of RAM and every
interrupt has an owner. `no_std` is not a restriction for its own sake; it is
the discipline of knowing exactly what runs and when.
:::

:::compare Bare metal, RTOS and embedded Linux
Bare metal gives direct control with no scheduler and no heap: smallest footprint, hardest real-time guarantees, most driver work. An RTOS adds tasks, priorities and synchronisation while keeping deterministic scheduling; embedded Linux offers processes, filesystems, networking and a huge ecosystem, but not microsecond determinism. Choose the smallest platform that meets the timing, power and connectivity requirements.
:::


## 8.1 `no_std` fundamentals: `core` and `alloc`

A `no_std` crate opts out of the standard library. It still has `core`
(language fundamentals, `Option`, `Result`, iterators, atomics) and can opt into
`alloc` (heap collections) when an allocator exists. It must provide a panic
handler and, on bare metal, an entry point and a linker script.

```rust
#![no_std]
#![no_main]

use core::panic::PanicInfo;
use cortex_m_rt::entry;

#[entry]
fn main() -> ! {
    // Board initialisation would go here.
    loop {
        core::hint::spin_loop();
    }
}

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {
        core::hint::spin_loop();
    }
}
```

With an allocator, `extern crate alloc;` unlocks `Box`, `Vec`, `String` and
`BTreeMap` (but not `HashMap`, which needs a random hasher). `embedded-alloc`
provides a simple allocator; heapless collections (`heapless::Vec`, `String`,
`Deque`, `AveragingBuffer`) avoid the heap entirely and are the better default
for fixed-capacity firmware.

```rust
#![no_std]
extern crate alloc;

use heapless::Vec;

fn build_buffer() -> Vec<u8, 64> {
    let mut buffer = Vec::new();
    for value in 0..10_u8 {
        let _ = buffer.push(value);
    }
    buffer
}

fn main() {
    let buffer = build_buffer();
    let _ = buffer;
}
```

The costs of `alloc` on a microcontroller are fragmentation, unpredictable
latency and a failure path that usually aborts. Prefer static buffers and
fixed-capacity collections; use `alloc` when the workload genuinely needs
dynamic sizes and the device has enough RAM.

## 8.2 `embedded-hal` traits: 0.2 and 1.0

`embedded-hal` defines portable traits for hardware: `OutputPin`, `InputPin`,
`DelayNs`, `I2c`, `SpiBus`, `SpiDevice`, `Pwm`, `Adc`, and `Can`. A driver
written against the traits works on any HAL that implements them.

| Trait | 1.0 shape | Typical use |
| --- | --- | --- |
| `digital::OutputPin` | `set_high`, `set_low`, `set_state` | LEDs, chip selects, relays |
| `digital::InputPin` | `is_high`, `is_low` | buttons, sensors |
| `i2c::I2c` | `transaction`, `read`, `write` | sensors, displays, EEPROM |
| `spi::SpiBus` / `SpiDevice` | `transfer`, `write`, `read` | displays, flash, radios |
| `pwm::SetDutyCycle` | `set_duty_cycle` | motors, backlights, audio |
| `adc::Adc` | `read` (with `embedded-hal` 1.1) | analogue sensors |
| `can::Can` | `transmit`, `receive` | automotive, industrial buses |

Version 0.2 used `Read`/`Write` traits for SPI and I2C and separate
`serial::Read`/`Write` traits. Version 1.0 replaced these with transaction-
oriented traits (`I2c::transaction`, `SpiBus`) and moved serial to
`embedded-io`. Many drivers still target 0.2; `embedded-hal-02` compatibility
shims and `embedded-hal-bus` adapters bridge the gap. New code should use 1.0,
and a driver crate should state which version it targets.

```rust
use embedded_hal::i2c::I2c;

/// Read a register from an I2C sensor: register pointer write, then read.
fn read_register<I2C: I2c>(bus: &mut I2C, address: u8, register: u8) -> Result<u8, I2C::Error> {
    let mut value = [0_u8; 1];
    bus.write_read(address, &[register], &mut value)?;
    Ok(value[0])
}
```

The `embedded-hal` traits are synchronous. Async HALs (Embassy) expose async
versions; `embedded-hal-async` defines async `I2c`, `SpiBus` and `DelayNs`. A
driver can offer both implementations behind a feature, which is why portable
drivers target the traits rather than a concrete HAL.

## 8.3 Microcontroller ecosystems: STM32, ESP32, nRF and RP2040

| Family | Crates | Core | Characteristics |
| --- | --- | --- | --- |
| STM32 | `stm32-hal`/`stm32f4xx-hal`, `embassy-stm32`, `stm32-metapac` | Cortex-M | huge peripheral matrix, mature PACs, great debug support |
| ESP32 | `esp-hal`, `esp-idf-hal` | Xtensa/RISC-V | Wi-Fi/BLE built in, `esp-hal` is `no_std`; `esp-idf-hal` uses ESP-IDF |
| nRF | `nrf-hal`, `embassy-nrf` | Cortex-M | excellent low-power radios (BLE, 802.15.4) |
| RP2040 | `rp-hal`, `embassy-rp` | dual Cortex-M0+ | PIO programmable I/O, cheap, USB bootloader |

```rust
// ESP32 (esp-hal): a blinking LED with the current API shape.
#![no_std]
#![no_main]

use esp_hal::gpio::{Level, Output};

#[esp_hal::main]
fn main() -> ! {
    let peripherals = esp_hal::init(esp_hal::Config::default());
    let mut led = Output::new(peripherals.GPIO2, Level::Low);
    loop {
        led.toggle();
        for _ in 0..1_000_000 {
            core::hint::spin_loop();
        }
    }
}
```

An STM32 program uses a PAC for registers and a HAL for typed peripherals:

```rust
// stm32f4xx-hal shape: take peripherals, configure clocks, drive a pin.
use stm32f4xx_hal::{pac, prelude::*};

fn main() -> ! {
    let device = pac::Peripherals::take().unwrap();
    let gpio = device.GPIOA.split();
    let mut led = gpio.pa5.into_push_pull_output();
    loop {
        led.set_high();
        cortex_m::asm::delay(1_000_000);
        led.set_low();
        cortex_m::asm::delay(1_000_000);
    }
}
```

nRF and RP2040 follow the same pattern: PAC → HAL → typed pins and buses. The
differences are clock trees, peripheral names and the radio stack. Start with the
board's BSP examples; they encode the correct clocks, bootloader and linker
script for that exact board.

## 8.4 Embassy: async for embedded

Embassy is an async executor and HAL family for microcontrollers. Tasks are
`async fn`s spawned on a static executor; peripherals are split into typed,
`Send`-safe resources; time and interrupts become await points. No RTOS is
required.

```rust
#![no_std]
#![no_main]

use embassy_executor::Spawner;
use embassy_stm32::gpio::{Level, Output, Speed};
use embassy_stm32::Config;
use embassy_time::{Duration, Timer};

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let peripherals = embassy_stm32::init(Config::default());
    let mut led = Output::new(peripherals.PA5, Level::Low, Speed::Low);

    loop {
        led.set_high();
        Timer::after(Duration::from_millis(500)).await;
        led.set_low();
        Timer::after(Duration::from_millis(500)).await;
    }
}
```

Concurrency comes from `spawn` and `join!`:

```rust
#[embassy_executor::task]
async fn blink(mut led: Output<'static>) {
    loop {
        led.toggle();
        Timer::after_millis(250).await;
    }
}

// In main: spawner.spawn(blink(led)).unwrap();
```

Embassy's interrupt-driven I/O means a UART read awaits without blocking the
executor. Timers are hardware-backed and low-power. The runtime is
single-threaded by default with interrupt priority handled by the HAL; a
blocking operation (a long `delay` loop or a busy-wait) blocks every task, so
use async peripherals. Embassy supports STM32, nRF, RP2040, ESP32 and
`embassy-time` for host tests.

## 8.5 RTIC: real-time interrupt-driven concurrency

RTIC is a framework for Cortex-M with compile-time task and resource
prioritisation. It statically checks that two tasks cannot access a shared
resource in a data race, and it handles interrupt priorities for you.

```rust
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use panic_halt as _;
use rtic::app;

#[app(device = stm32f4xx_hal::pac, peripherals = true, dispatchers = [USART1])]
mod app {
    use super::*;
    use stm32f4xx_hal::prelude::*;

    #[shared]
    struct Shared {}

    #[local]
    struct Local {
        led: stm32f4xx_hal::gpio::Pin<'A', 5, stm32f4xx_hal::gpio::Output>,
    }

    #[init]
    fn init(cx: init::Context) -> (Shared, Local) {
        let gpio = cx.device.GPIOA.split();
        let led = gpio.pa5.into_push_pull_output();
        (Shared {}, Local { led })
    }

    #[task(binds = SysTick, local = [led])]
    fn tick(mut cx: tick::Context) {
        cx.local.led.toggle();
    }
}
```

`#[shared]` resources are accessed through a generated lock that respects task
priorities; `#[local]` resources belong to one task. Software tasks have
priorities and are dispatched from interrupt handlers. RTIC gives hard
real-time guarantees with minimal overhead, but its static model is less
flexible than Embassy's dynamic tasks. Use RTIC when response time and priority
analysis matter; use Embassy when I/O concurrency and code simplicity matter.

| | Embassy | RTIC |
| --- | --- | --- |
| Model | async tasks, executor | interrupt tasks, priorities |
| Scheduling | cooperative, await points | pre-emptive by interrupt priority |
| Sharing | `Mutex`, channels, `Signal` | `#[shared]` with generated locks |
| Hard real time | with care (no pre-emption) | designed for it |
| Ecosystem | async HALs | sync HALs, broad |

## 8.6 HALs and board support packages

A **PAC** (peripheral access crate) exposes raw registers as a struct of typed
peripherals. A **HAL** wraps the PAC with safe, typed APIs (pins, clocks, buses).
A **BSP** (board support package) configures a specific board: pinout, clocks,
external chips, bootloader and examples.

```text
pac crate (registers) → hal crate (safe peripheral API) → bsp crate (board)
                                      ↘ embedded-hal traits ↗
```

Choose a BSP when one exists for your board (`bbc-microbit`, `stm32f4-discovery`,
`esp32-c3-devkit-rust-1`, `rp-pico`); it saves a day of clock and pin debugging.
For a custom board, use the HAL and write a small board module that owns the
pin assignments. Board crates also document the boot mode, the crystal frequency
and the debug connector, which are the three things that stop a first boot.

## 8.7 GPIO, I2C, SPI, UART, ADC, DAC and PWM

```rust
use embedded_hal::digital::{InputPin, OutputPin};
use embedded_hal::pwm::SetDutyCycle;

fn poll_button<B: InputPin>(button: &mut B, led: &mut impl OutputPin) {
    if button.is_low().unwrap_or(false) {
        let _ = led.set_high();
    } else {
        let _ = led.set_low();
    }
}

fn set_brightness<P: SetDutyCycle>(pwm: &mut P, percent: u8) -> Result<(), P::Error> {
    let max = pwm.max_duty_cycle();
    let duty = (max as u32 * percent as u32 / 100) as u16;
    pwm.set_duty_cycle(duty)
}
```

- **GPIO**: configure direction, pull-up/pull-down, open-drain, speed. Buttons
  need debouncing (10–20 ms) and a pull resistor.
- **I2C**: two wires (SDA, SCL), 7-bit addresses, clock stretching. Use
  `write_read` for register reads; scan the bus at start-up to find devices.
- **SPI**: four wires (SCK, MOSI, MISO, CS), modes 0–3 (clock polarity/phase).
  A `SpiDevice` owns the chip-select for one peripheral; `SpiBus` shares the bus.
- **UART**: asynchronous serial, baud rate, framing, flow control. Use
  `embedded-io` async/sync traits or the HAL's serial type; add a ring buffer
  and a framing protocol (length + checksum) for reliability.
- **ADC**: resolution, reference voltage, sampling time, calibration. Oversample
  and average to reduce noise; beware the input impedance of the source.
- **DAC**: direct analogue output; useful for waveforms and references.
- **PWM**: frequency and duty cycle; for motors, a gate driver and dead time;
  for LEDs, a frequency above the flicker fusion threshold.

## 8.8 DMA (Direct Memory Access)

DMA moves data between peripherals and memory without the CPU, which is
essential for high-rate ADC, SPI displays and UART. On STM32 with Embassy, many
peripheral transfers are DMA-backed by default; with a bare HAL, you configure a
stream, a direction, a buffer and an interrupt on completion.

```rust
// The shape of a DMA transfer with an async HAL: the future completes when
// the transfer finishes, and the buffer is returned.
async fn send_frame(spi: &mut embassy_stm32::spi::Spi<'_, embassy_stm32::mode::Async>, frame: &[u8]) {
    spi.write(frame).await.unwrap();
}
```

Rules: the buffer must outlive the transfer, must not be modified while DMA
reads it, and must be cache-aligned on MCUs with a data cache (Cortex-M7).
Circular DMA is ideal for continuous ADC sampling; double buffering avoids
tearing. Always handle the error and half-transfer interrupts if you process
streams. A DMA bug often looks like random corruption, so assert buffer
ownership in the type system where possible (Embassy does).

## 8.9 Interrupts and NVIC configuration

An interrupt service routine (ISR) runs asynchronously, pre-empting tasks. Keep
it short: clear the source, move data to a queue, set a flag, return. The NVIC
assigns priorities; on Cortex-M, a lower number is a higher priority, and
priority grouping determines pre-emption.

```rust
use core::cell::RefCell;
use cortex_m::interrupt::{self, Mutex};
use cortex_m::peripheral::NVIC;
use stm32f4xx_hal::pac::{interrupt, Interrupt, TIM2};

static COUNTER: Mutex<RefCell<u32>> = Mutex::new(RefCell::new(0));

#[interrupt]
fn TIM2() {
    interrupt::free(|cs| {
        if let Some(counter) = COUNTER.borrow(cs).try_borrow_mut().ok() {
            // Increment atomically with respect to other critical sections.
            *counter.borrow_mut() += 1;
        }
    });
}

fn enable(device: &mut stm32f4xx_hal::pac::Peripherals) {
    unsafe {
        NVIC::unmask(Interrupt::TIM2);
    }
    let _ = (device, TIM2::ptr());
}
```

`cortex_m::interrupt::free` disables interrupts for a critical section;
`Mutex<RefCell<T>>` from `cortex-m` is the usual shared-state primitive. On
multi-core RP2040, use the hardware spinlocks or `critical-section` with the
appropriate implementation. Never call a blocking API from an ISR, and never
allocate. `defmt`/`rtt-target` logging from an ISR must be non-blocking.

## 8.10 Timers and clock configuration

Clocks determine baud rates, timer periods and power. A typical STM32 boot
configures the internal or external oscillator, PLL multipliers, AHB/APB prescalers
and flash wait states; get one wrong and the UART is garbled. A HAL's
`Rcc::freeze()` returns the resulting clock frequencies, which timer and serial
constructors use.

```rust
use stm32f4xx_hal::{pac, prelude::*};

fn clocks() -> stm32f4xx_hal::rcc::Clocks {
    let device = pac::Peripherals::take().unwrap();
    let rcc = device.RCC.constrain();
    rcc.cfgr
        .use_hse(25.MHz())
        .sysclk(84.MHz())
        .pclk1(42.MHz())
        .freeze()
}
```

Timer types: a **systick** for the scheduler, **general-purpose** timers for
periodic tasks, **advanced** timers for PWM with dead time, **watchdog** for
recovery and **RTC** for wall-clock time. Use the HAL's `Timer` or Embassy's
`Timer` rather than programming registers; prescaler and auto-reload arithmetic
is a common source of off-by-one errors. Measure the real output with a scope
or a logic analyser when timing matters.

## 8.11 Low-power modes and sleep states

Battery devices spend most of their life asleep. Cortex-M offers sleep, deep
sleep and standby; the MCU wakes on an interrupt, a timer or a radio event.
Current consumption ranges from milliamps to nanoamps depending on the mode and
which peripherals stay powered.

- Turn off unused peripherals and clocks; configure unused pins as analogue or
  with a defined level to avoid leakage.
- Use the deepest sleep that still preserves the state you need; on STM32,
  `WFI`/`WFE` with `SLEEPDEEP` and a low-power regulator.
- Use an RTC or a low-power timer to wake periodically; a watchdog to recover.
- Power-gate sensors and radios with a load switch; a sleeping MCU with a
  powered sensor is still a battery drain.
- Measure with a current profiler (Nordic PPK2, Joulescope), not a multimeter
  average.

```rust
// Embassy: awaiting a timer lets the executor enter the HAL's low-power state.
use embassy_time::{Duration, Timer};

async fn duty_cycle() {
    loop {
        // Wake, read a sensor, transmit, then sleep for most of the period.
        Timer::after(Duration::from_secs(60)).await;
    }
}
```

## 8.12 RTOS integration

Rust can run on FreeRTOS, Zephyr, NuttX and ThreadX. The `freertos-rust` and
`zephyr` crates bind the scheduler; `embassy` can run as a task inside an RTOS.
Advantages: existing drivers, certification, networking stacks and a scheduling
model the team knows. Costs: FFI boundaries, a second memory model and a larger
binary.

For safety-critical systems, an RTOS with certification evidence may be
mandatory. For a new design, Embassy or RTIC usually produce a smaller, more
auditable firmware. If you must integrate, isolate the RTOS API behind a safe
Rust wrapper, keep ISRs short, and test stack sizes under worst-case load.

## 8.13 Firmware update mechanisms: OTA and A/B partitioning

An update mechanism must be **atomic**, **authenticated** and **recoverable**.
The common design is two application slots (A/B) plus a bootloader that selects
the active slot, verifies a signature and rolls back on failure.

```text
flash:
  [bootloader][metadata][slot A][slot B][config][keys]
boot: read metadata -> verify signature -> try preferred slot -> on failure, roll back
```

Steps: receive the image over a secure channel, write it to the inactive slot,
verify a hash and a signature with a public key stored in ROM, mark it bootable,
reboot, and let the new image confirm health within a timeout. Keep the old slot
until confirmation. Store a monotonic version to prevent downgrade attacks, and
never accept an unsigned image because "it is internal".

```rust
struct Slot {
    address: u32,
    length: u32,
    version: u32,
    confirmed: bool,
}

fn choose_slot(a: &Slot, b: &Slot) -> &Slot {
    if b.version > a.version && b.confirmed {
        b
    } else {
        a
    }
}

fn main() {
    let a = Slot { address: 0x0800_8000, length: 0x2_0000, version: 3, confirmed: true };
    let b = Slot { address: 0x0802_8000, length: 0x2_0000, version: 4, confirmed: false };
    println!("{}", choose_slot(&a, &b).version);
}
```

`mcuboot` is a mature bootloader with Rust support; `embassy-boot` provides
A/B updates with rollback. OTA over cellular or LoRa needs chunking, resumable
transfers and a size budget; a failed update that bricks a remote device is a
field visit.

## 8.14 Sensor drivers

A sensor driver reads registers, converts raw values and exposes a typed API.
Use `embedded-hal` traits, handle errors, document the conversion and calibrate
where the datasheet requires it.

```rust
use embedded_hal::i2c::I2c;

const ADDRESS: u8 = 0x48;
const TEMP_REGISTER: u8 = 0x00;

struct TemperatureSensor<I2C> {
    bus: I2C,
}

impl<I2C: I2c> TemperatureSensor<I2C> {
    fn new(bus: I2C) -> Self {
        Self { bus }
    }

    /// Reads a 12-bit temperature in degrees Celsius (example conversion).
    fn read_celsius(&mut self) -> Result<f32, I2C::Error> {
        let mut raw = [0_u8; 2];
        self.bus.write_read(ADDRESS, &[TEMP_REGISTER], &mut raw)?;
        let value = ((raw[0] as u16) << 4) | ((raw[1] as u16) >> 4);
        Ok(value as f32 * 0.0625)
    }
}
```

Drivers worth knowing: `bme280`/`bme680` (temperature, humidity, pressure),
`mpu6050`/`lis3dh` (accelerometers), `hmc5883l` (magnetometer), `ina219`
(power), `sht3x` (humidity), `ds3231` (RTC). Search crates.io for the part
number and check the `embedded-hal` version and maintenance date. A driver that
blocks indefinitely on a missing device hangs the firmware; add timeouts at the
bus layer and an initial WHO_AM_I check.

## 8.15 Display drivers: embedded-graphics, SSD1306 and ST7789

`embedded-graphics` is a 2D drawing library for monochrome and colour displays:
primitives, text, images and styles, with drivers implementing `DrawTarget`.

```rust
use embedded_graphics::{
    mono_font::{ascii::FONT_6X10, MonoTextStyle},
    pixelcolor::BinaryColor,
    prelude::*,
    text::Text,
};
use ssd1306::{prelude::*, I2CDisplayInterface, Ssd1306};

fn draw<D: DrawTarget<Color = BinaryColor>>(display: &mut D) -> Result<(), D::Error> {
    display.clear(BinaryColor::Off)?;
    let style = MonoTextStyle::new(&FONT_6X10, BinaryColor::On);
    Text::new("Hello, Rust!", Point::new(0, 20), style).draw(display)?;
    Ok(())
}

fn main() {
    // let interface = I2CDisplayInterface::new(i2c);
    // let mut display = Ssd1306::new(interface, DisplaySize128x64, DisplayRotation::Rotate0)
    //     .into_buffered_graphics_mode();
    let _ = (draw::<Ssd1306<_, _, _>>, FONT_6X10);
}
```

For colour TFTs, `mipidsi` drives ST7735/ST7789/ILI9341 panels; `st7789` is a
dedicated driver. Use a framebuffer for flicker-free updates, DMA for the SPI
transfer, and partial updates when the panel supports them. Mind the panel's
orientation, offset and colour order; these differ even between modules with the
same controller.

## 8.16 USB device and host

`usb-device` implements the USB device stack; `usbd-serial` exposes a CDC-ACM
serial port, `usbd-hid` a keyboard/mouse, and `usbd-storage` a mass-storage
device. On the host side, `usb-host` and `embedded-usb-pd` are emerging; Linux
hosts use `nusb` or `rusb`.

```rust
use usb_device::class_prelude::UsbBusAllocator;
use usb_device::prelude::*;
use usbd_serial::SerialPort;

fn serial<'a, B: UsbBus>(allocator: &'a UsbBusAllocator<B>) -> SerialPort<'a, B> {
    SerialPort::new(allocator)
}

fn enumerate<'a, B: UsbBus>(serial: SerialPort<'a, B>, allocator: &'a UsbBusAllocator<B>) -> UsbDevice<'a, B> {
    UsbDeviceBuilder::new(allocator, UsbVidPid(0x1209, 0x0001))
        .strings(&[StringDescriptors::default()
            .manufacturer("Rust from Zero")
            .product("Serial demo")
            .serial_number("0001")])
        .unwrap()
        .device_class(usbd_serial::USB_CLASS_CDC)
        .build()
}
```

USB is strict about timing and enumeration; use the HAL's USB peripheral and
the examples for your MCU. A custom VID/PID costs a licence; use a test PID
(`0x1209`) for prototypes. For a serial console that does not need USB, a UART
plus an FTDI cable is simpler.

## 8.17 CAN bus communication

CAN is a differential, multi-master bus used in vehicles and industrial systems.
Classic CAN frames carry up to 8 bytes; CAN FD carries up to 64 with a faster
data phase. `embedded-can` defines the traits; `bxcan` implements them for
STM32, `can-dbc` parses DBC files.

```rust
use embedded_can::{Frame, Id, StandardId};

fn build_frame(payload: &[u8]) -> Option<embedded_can::Frame> {
    let id = StandardId::new(0x123)?;
    embedded_can::Frame::new(Id::Standard(id), payload)
}

fn main() {
    if let Some(frame) = build_frame(&[1, 2, 3, 4]) {
        println!("{:?}", frame.data());
    }
}
```

Configure the bit timing for the bus rate (125k, 250k, 500k, 1M), enable
termination (120 Ω at each end), and handle bus-off recovery. Messages are
broadcast; there is no authentication or encryption, so a gateway must enforce
which frames are trusted. `socketcan` on Linux lets you test against a virtual
CAN interface (`vcan0`).

## 8.18 MQTT with `rumqttc`

MQTT is a publish/subscribe protocol over TCP/TLS with QoS 0/1/2, retained
messages and last-will. It is the default for IoT telemetry because it is
lightweight and survives intermittent links.

```rust
use rumqttc::{AsyncClient, MqttOptions, QoS};
use std::time::Duration;

async fn publish() -> Result<(), Box<dyn std::error::Error>> {
    let mut options = MqttOptions::new("device-001", "broker.example.com", 8883);
    options.set_keep_alive(Duration::from_secs(30));
    options.set_credentials("device", "secret");
    // options.set_transport(rumqttc::Transport::tls_with_default_config());

    let (client, mut eventloop) = AsyncClient::new(options, 32);
    // Drive the event loop in a task; the client queues outgoing messages.
    tokio::spawn(async move {
        loop {
            if let Err(error) = eventloop.poll().await {
                eprintln!("mqtt: {error}");
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    });

    client
        .publish("devices/001/telemetry", QoS::AtLeastOnce, false, b"{\"temp\":21.5}")
        .await?;
    Ok(())
}

fn main() {
    let _ = publish;
}
```

Use a persistent client id and a clean session only when you can afford to lose
queued messages. QoS 1 gives at-least-once delivery; make handlers idempotent.
TLS with certificate verification is mandatory on the public internet; embed a
CA bundle or use a device certificate. `rumqttd` is a broker in Rust for local
testing.

## 8.19 CoAP

CoAP is a UDP-based REST protocol for constrained devices: `GET`/`POST`/`PUT`/
`DELETE` over small messages, with observe and block-wise transfer. `coap-request`
and `coap-lite` are Rust implementations; `dropped` is a CoAP server for hosted
use.

```rust
use coap_lite::{CoapRequest, Packet, RequestType};

fn request() -> Packet {
    let mut request: CoapRequest<()> = CoapRequest::new();
    request.set_method(RequestType::Get);
    request.set_path("/sensors/temp");
    request.get_packet().clone()
}

fn main() {
    println!("{:?}", request().get_uri_path());
}
```

CoAP runs over UDP with optional DTLS; messages can be lost, so implement
confirmable messages and retransmission. Observe (`RFC 7641`) gives a
subscription without a persistent TCP connection. Use CoAP when the device has
very little RAM or the network is non-IP; use MQTT when a broker and TCP are
available.

## 8.20 LoRaWAN with `lorawan-device`

LoRaWAN is a long-range, low-power, low-bandwidth network. A device joins a
network (OTAA preferred), sends uplinks within duty-cycle limits and receives
downlinks in short windows. `lorawan-device` implements the MAC; you provide the
radio and a region.

```text
Device::new(radio, region)?          // implement lorawan_device::Radio for your transceiver
device.join(&JoinMode::OTAA(credentials)).await?
device.send(&payload, port, confirmed).await?
device.process().await?              // drive the MAC in a loop for downlinks
```

The example is configuration-shaped rather than a compilable driver: the radio
implementation comes from your transceiver crate, and the exact constructor
signature follows the `lorawan-device` version you pin.

Duty cycle limits are legal requirements, not suggestions: the firmware must
respect the airtime budget and the regional parameters. Payloads are tiny
(51–242 bytes depending on data rate), so encode compact binary, not JSON.
Confirmed uplinks cost downlink capacity. Test with a public network (TTN) and a
development device before certifying hardware.

## 8.21 BLE with `bt-hci`, `trouble` and `rubble`

BLE has a controller (radio, link layer) and a host (GAP, GATT, security). On
Nordic parts, the SoftDevice or the newer `bt-hci`/`nrf-softdevice` stacks
provide the controller; `trouble` is an async host; `rubble` is a host stack
designed for `no_std`. `bluer` is a Linux BlueZ client, useful for testing.

```text
GATT service: 0x180F (battery)
  characteristic 0x2A19 (battery level)
    permissions: read, notify
    value: u8 percent

Advertising: name "rust-device", service UUID 0x180F, interval 100–500 ms
```

`trouble` provides an async host, a `Host`/`Runner` split and attribute tables;
the exact builder API changes between releases, so follow the version's example
for your controller. `rubble` targets `no_std` hosts, and `bt-hci` separates the
controller transport (UART, USB or a SoftDevice) from the host.

A GATT service has characteristics with permissions (read/write/notify) and
descriptors. Pairing and bonding need a key store; without it, a device cannot
reconnect securely. Keep connection intervals and advertising intervals power-
aware. BLE is not IP: a gateway or a phone bridges it to MQTT/HTTP. Test
interoperability with Android, iOS and a desktop client, not only your own.

## 8.22 Cross-compilation for ARM Cortex-M and RISC-V

```sh
rustup target add thumbv7em-none-eabihf
rustup target add thumbv6m-none-eabi
rustup target add riscv32imac-unknown-none-elf
cargo build --release --target thumbv7em-none-eabihf
```

```toml
# .cargo/config.toml
[build]
target = "thumbv7em-none-eabihf"

[target.thumbv7em-none-eabihf]
runner = "probe-rs run --chip STM32F411RETx"
rustflags = ["-C", "link-arg=-Tlink.x"]
```

The target has no `std`, so the crate declares `#![no_std]`; `cortex-m-rt`
provides the vector table and startup code; a linker script (`memory.x` plus
`link.x`) places sections in flash and RAM. `esp-hal` uses Xtensa or RISC-V
targets with a custom toolchain for Xtensa. `riscv32imac-unknown-none-elf` lacks
hardware floating point; use `riscv32imafc` if the core has an FPU. Always build
in release for size (`opt-level = "s"`, LTO, `panic = "abort"`) and measure the
binary with `cargo size` or `bloat`.

## 8.23 Probe and debugging tools: probe-rs, OpenOCD

`probe-rs` is a modern debugger and flasher for ARM and RISC-V, with a CLI,
`cargo-flash`, `cargo-embed`, RTT logging and a VS Code extension. OpenOCD is
the older, broad alternative with GDB.

```sh
probe-rs list
probe-rs run --chip STM32F411RETx target/thumbv7em-none-eabihf/release/app
probe-rs debug --chip nRF52840_xxAA
cargo embed --release       # flash + RTT logs + GDB server
```

`defmt` logs are compressed and sent over RTT, which is far faster than
semihosting. Use `probe-rs attach` to inspect a running target, set breakpoints
in VS Code, and read `defmt` output without a UART. `openocd -f interface/cmsis-dap.cfg
-f target/stm32f4x.cfg` then `arm-none-eabi-gdb` is the classic path. A logic
analyser and an oscilloscope are often more useful than a debugger for timing and
bus problems.

## Exercises

:::exercise guided Blink with Embassy and measure it
Write an Embassy firmware that blinks an LED at 2 Hz, logs the loop count over
RTT with `defmt`, and sleeps in the deepest low-power mode between toggles.
Build it for your board, flash it with `probe-rs`, and measure the current with a
power profiler or estimate it from the datasheet.
::hint
Use `Output::new(pin, Level::Low, Speed::Low)`, `Timer::after_millis(250).await`,
and `defmt::info!`. For low power, ensure no other task keeps a peripheral clock
enabled; Embassy's executor enters `WFI` when all tasks are waiting. Measure
with a Joulescope/PPK2 or calculate `duty × active current + (1 - duty) × sleep
current`.
::solution
```rust
#![no_std]
#![no_main]

use defmt_rtt as _;
use embassy_executor::Spawner;
use embassy_stm32::gpio::{Level, Output, Speed};
use embassy_time::{Duration, Timer};
use panic_probe as _;

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let peripherals = embassy_stm32::init(embassy_stm32::Config::default());
    let mut led = Output::new(peripherals.PA5, Level::Low, Speed::Low);
    let mut count = 0_u32;

    loop {
        led.toggle();
        count = count.wrapping_add(1);
        defmt::info!("toggle {}", count);
        Timer::after(Duration::from_millis(250)).await;
    }
}
```
:::

:::exercise practice Read an I2C sensor with error handling
Implement a `read_temperature` function over `embedded_hal::i2c::I2c` that
performs a WHO_AM_I check at start-up, returns a typed error for a missing
device and a bus error, applies a calibration offset, and retries once on a bus
error. Write host tests with a mock I2C implementation.
::hint
Define `enum SensorError<E> { Missing, Bus(E), BadId(u8) }`. Implement the
`I2c` trait for a `MockBus` in `#[cfg(test)]`, with a register map. Use
`write_read` and map the error. Retry by calling the inner function twice.
::solution
```rust
use embedded_hal::i2c::I2c;

#[derive(Debug, PartialEq)]
enum SensorError<E> {
    Missing,
    BadId(u8),
    Bus(E),
}

struct Sensor<I2C> {
    bus: I2C,
    address: u8,
    offset: f32,
}

impl<I2C: I2c> Sensor<I2C> {
    fn new(mut bus: I2C, address: u8, offset: f32) -> Result<Self, SensorError<I2C::Error>> {
        let mut id = [0_u8; 1];
        bus.write_read(address, &[0x0F], &mut id).map_err(SensorError::Bus)?;
        if id[0] != 0x48 {
            return Err(SensorError::BadId(id[0]));
        }
        Ok(Self { bus, address, offset })
    }

    fn read_raw(&mut self) -> Result<f32, SensorError<I2C::Error>> {
        let mut raw = [0_u8; 2];
        self.bus
            .write_read(self.address, &[0x00], &mut raw)
            .map_err(SensorError::Bus)?;
        let value = ((raw[0] as u16) << 4) | ((raw[1] as u16) >> 4);
        Ok(value as f32 * 0.0625 + self.offset)
    }

    fn read(&mut self) -> Result<f32, SensorError<I2C::Error>> {
        self.read_raw().or_else(|_| self.read_raw())
    }
}

fn main() {
    let _ = std::marker::PhantomData::<Sensor<()>>;
}
```
:::

:::exercise challenge A secure OTA skeleton
Design and implement the metadata and verification logic for an A/B OTA update:
image header with magic, version, length and SHA-256; a signature over the
header and image; slot selection with rollback; and a confirmation flag. Use
`sha2` and `ed25519-dalek` (host test), and describe the bootloader sequence in
comments. Include a downgrade-rejection test.
::hint
Verify the signature before reading the image length, check the magic and the
target board id, reject `version <= running_version`, and only mark a slot
bootable after verification. On first boot of a new slot, set `confirmed` after
the application reports healthy; the bootloader rolls back if it does not.
::solution
```rust
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};

const MAGIC: u32 = 0x5255_5354; // "RUST"

#[derive(Debug)]
struct Header {
    magic: u32,
    board: u16,
    version: u32,
    length: u32,
    digest: [u8; 32],
}

#[derive(Debug, PartialEq)]
enum UpdateError {
    BadMagic,
    WrongBoard,
    Downgrade,
    BadLength,
    BadDigest,
    BadSignature,
}

fn verify(
    header: &Header,
    image: &[u8],
    signature: &[u8; 64],
    key: &VerifyingKey,
    running_version: u32,
    board: u16,
) -> Result<(), UpdateError> {
    if header.magic != MAGIC {
        return Err(UpdateError::BadMagic);
    }
    if header.board != board {
        return Err(UpdateError::WrongBoard);
    }
    if header.version <= running_version {
        return Err(UpdateError::Downgrade);
    }
    if header.length as usize != image.len() {
        return Err(UpdateError::BadLength);
    }
    let digest: [u8; 32] = Sha256::digest(image).into();
    if digest != header.digest {
        return Err(UpdateError::BadDigest);
    }

    let mut signed = Vec::new();
    signed.extend_from_slice(&header.magic.to_le_bytes());
    signed.extend_from_slice(&header.board.to_le_bytes());
    signed.extend_from_slice(&header.version.to_le_bytes());
    signed.extend_from_slice(&header.length.to_le_bytes());
    signed.extend_from_slice(&header.digest);
    signed.extend_from_slice(image);

    let signature = Signature::from_bytes(signature);
    key.verify(&signed, &signature).map_err(|_| UpdateError::BadSignature)
}

fn main() {
    // Bootloader outline:
    // 1. Read the inactive slot header; reject on any error.
    // 2. Verify the signature against the public key burned into ROM.
    // 3. Mark the slot bootable and reboot into it.
    // 4. Application reports healthy; set confirmed = true.
    // 5. If the application does not confirm within N boots, roll back.
    let key = VerifyingKey::from_bytes(&[7_u8; 32]);
    let _ = key;
    println!("{:?}", MAGIC);
}
```

The downgrade check must use a **monotonic** counter stored outside the image
and protected against rollback; a version field the attacker can edit is not
enough. A signature over the image only, without the header, lets an attacker
reuse an old signed image with a new version.
:::

## Quiz

:::quiz Embedded and IoT check
? Why does bare-metal Rust use `#![no_std]`?
- Because microcontrollers cannot run compiled code
+ Because `std` assumes an OS with threads, files and a heap; `core` provides the language without those assumptions
- Because `no_std` makes code faster
- Because the linker cannot handle `std`
= `std` depends on an operating system. `core` supplies `Option`, `Result`, iterators, atomics and formatting traits; `alloc` adds heap types when an allocator exists.

? What is the difference between `embedded-hal` 0.2 and 1.0?
- 1.0 adds async
+ 1.0 replaces separate read/write traits with transaction-oriented traits such as `I2c::transaction` and `SpiBus`, and moves serial to `embedded-io`
- 0.2 is for STM32 only
- They are identical
= The 1.0 API models bus transactions and shared devices explicitly (`SpiDevice`), which removes ambiguity around chip select and repeated starts. Async traits live in `embedded-hal-async`.

? When should you choose RTIC over Embassy?
- When you need dynamic task creation and async I/O
+ When you need pre-emptive priority scheduling and static resource analysis for hard real-time guarantees
- When you need a heap
- When the target is RISC-V only
= RTIC's interrupt-priority model and compile-time resource sharing suit hard real-time systems. Embassy's cooperative executor is simpler and better for async I/O but does not pre-empt a running task.

? What makes an OTA update safe?
- Writing the new image over the running one
+ Writing to an inactive slot, verifying a signature and hash, booting with rollback and requiring confirmation
- Using HTTPS only
- Compressing the image
= Atomic A/B slots plus signature verification, version/downgrade checks and rollback protect against corruption and attack. HTTPS protects transport, not the stored image.

? What does LoRaWAN duty-cycle compliance require?
- Sending as fast as possible
+ Limiting airtime per band and sub-band according to regional regulation
- Using only confirmed uplinks
- Disabling encryption
= Duty cycle is a legal limit. Firmware must budget airtime, respect the region's parameters and avoid confirmed uplinks unless necessary.

:::

:::recap
- `no_std` uses `core`, optionally `alloc`; `heapless` collections avoid the heap.
- `embedded-hal` 1.0 provides transaction-oriented portable traits; 0.2 drivers still exist and adapters bridge them.
- STM32, ESP32, nRF and RP2040 each have a PAC, HAL and BSP; start from board examples.
- Embassy runs async tasks on a static executor; RTIC provides pre-emptive, priority-checked tasks.
- GPIO, I2C, SPI, UART, ADC, DAC and PWM are accessed through typed HAL APIs.
- DMA needs buffer ownership and cache care; interrupts must be short and non-blocking.
- Clocks determine every bus rate; low-power design turns off clocks and peripherals.
- OTA uses A/B slots, signatures, rollback and confirmation.
- Sensors, displays, USB and CAN are driver work with strict timing and conversion rules.
- MQTT, CoAP, LoRaWAN and BLE connect devices with different power and transport trade-offs.
- Cross-compile with the right target, linker script and runner; debug with `probe-rs` and `defmt`.
:::
