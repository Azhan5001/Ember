use anyhow::{bail, Result};
use librqbit::{
    storage::{filesystem::FilesystemStorageFactory, BoxStorageFactory, StorageFactory, StorageFactoryExt, TorrentStorage},
    ManagedTorrentShared, TorrentMetadata,
};
use std::{ffi::CString, os::unix::ffi::OsStrExt, path::{Path, PathBuf}};

const RESERVE: u64 = 512 * 1024 * 1024;

pub fn check(path: &Path, next_write: usize) -> Result<()> {
    let path = CString::new(path.as_os_str().as_bytes())?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    if unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return Err(std::io::Error::last_os_error().into());
    }
    let stats = unsafe { stats.assume_init() };
    let available = (stats.f_bavail as u64).saturating_mul(stats.f_frsize as u64);
    if !fits_reserve(available, next_write as u64) {
        bail!("Raw torrent playback needs at least 512 MiB of free space. Choose a cached debrid stream.");
    }
    Ok(())
}

fn fits_reserve(available: u64, next_write: u64) -> bool {
    available.saturating_sub(next_write) >= RESERVE
}

pub fn live_boot() -> bool {
    Path::new("/run/initramfs/live/LiveOS").exists()
        || std::fs::read_to_string("/proc/cmdline").is_ok_and(live_args)
}

fn live_args(line: String) -> bool {
    line.split_whitespace().any(|arg| {
        arg == "rd.live.image" || arg == "rd.live.image=1" || arg.starts_with("root=live:")
    })
}

#[cfg(test)]
#[test]
fn live_and_low_space_guards() {
    assert!(live_args("quiet rd.live.image root=live:CDLABEL=Fedora".into()));
    assert!(!live_args("quiet root=UUID=fixture".into()));
    assert!(!fits_reserve(400 * 1024 * 1024, 0));
    assert!(!fits_reserve(RESERVE + 1024, 2048));
    assert!(fits_reserve(RESERVE + 2048, 2048));
}

#[derive(Clone)]
pub struct Factory(pub PathBuf);

impl StorageFactory for Factory {
    type Storage = Guarded;

    fn create(&self, shared: &ManagedTorrentShared, metadata: &TorrentMetadata) -> Result<Guarded> {
        let storage = FilesystemStorageFactory::default().create(shared, metadata)?;
        Ok(Guarded { root: self.0.clone(), storage: Box::new(storage) })
    }

    fn clone_box(&self) -> BoxStorageFactory { self.clone().boxed() }
}

pub struct Guarded {
    root: PathBuf,
    storage: Box<dyn TorrentStorage>,
}

impl TorrentStorage for Guarded {
    fn init(&mut self, shared: &ManagedTorrentShared, metadata: &TorrentMetadata) -> Result<()> {
        check(&self.root, 0)?;
        self.storage.init(shared, metadata)
    }

    fn pread_exact(&self, file: usize, offset: u64, bytes: &mut [u8]) -> Result<()> {
        self.storage.pread_exact(file, offset, bytes)
    }

    fn pwrite_all(&self, file: usize, offset: u64, bytes: &[u8]) -> Result<()> {
        check(&self.root, bytes.len())?;
        self.storage.pwrite_all(file, offset, bytes)
    }

    fn remove_file(&self, file: usize, path: &Path) -> Result<()> {
        self.storage.remove_file(file, path)
    }

    fn remove_directory_if_empty(&self, path: &Path) -> Result<()> {
        self.storage.remove_directory_if_empty(path)
    }

    fn ensure_file_length(&self, file: usize, length: u64) -> Result<()> {
        // Filesystems without sparse files can allocate the entire length here.
        check(&self.root, usize::try_from(length).unwrap_or(usize::MAX))?;
        self.storage.ensure_file_length(file, length)
    }

    fn take(&self) -> Result<Box<dyn TorrentStorage>> {
        Ok(Box::new(Self { root: self.root.clone(), storage: self.storage.take()? }))
    }
}
