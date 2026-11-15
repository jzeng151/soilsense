Attributes {
    precipitation {
        String units "mm/day";
        String long_name "Daily mean precipitation rate (combined microwave-IR) estimate. Formerly precipitationCal.";
        String coordinates "time lon lat";
        Float32 _FillValue -9999.90039;
    }
    precipitation_cnt {
        String units "count";
        String long_name "Count of all valid half-hourly precipitation retrievals for the day";
        String coordinates "time lon lat";
    }
    precipitation_cnt_cond {
        String units "count";
        String long_name "Count of half-hourly precipitation retrievals for the day where precipitation is at least 0.01 mm/hr";
        String coordinates "time lon lat";
    }
    MWprecipitation {
        String units "mm/day";
        String long_name "Daily mean High Quality precipitation rate from all available microwave sources. Formerly HQprecipitation.";
        String coordinates "time lon lat";
        Float32 _FillValue -9999.90039;
    }
    MWprecipitation_cnt {
        String units "count";
        String long_name "Count of all valid half-hourly MWprecipitation retrievals for the day";
        String coordinates "time lon lat";
    }
    MWprecipitation_cnt_cond {
        String units "count";
        String long_name "Count of half-hourly MWprecipitation retrievals for the day where precipitation is at least 0.01 mm/hr";
        String coordinates "time lon lat";
    }
    randomError {
        String units "mm/day";
        String long_name "Root-mean-square error estimate for combined microwave-IR daily precipitation rate";
        String coordinates "time lon lat";
        Float32 _FillValue -9999.90039;
    }
    randomError_cnt {
        String units "count";
        String long_name "Count of valid half-hourly randomError retrievals for the day";
        String coordinates "time lon lat";
    }
    probabilityLiquidPrecipitation {
        String units "percent";
        String long_name "Probability of liquid precipitation";
        String description "Probability of liquid precipitation estimated with a diagnostic parameterization using ancillary data. 0=missing values; 1=likely solid; 100=likely liquid or no precipitation.  Screen by positive precipitation or precipitation_cnt_cond to locate meaningful probabilities.";
        String coordinates "time lon lat";
    }
    lon {
        String units "degrees_east";
        String long_name "Longitude";
    }
    lat {
        String units "degrees_north";
        String long_name "Latitude";
    }
    time {
        String units "days since 1980-01-06 00:00:00Z";
        String standard_name "time";
        String long_name "time";
        String bounds "time_bnds";
    }
    time_bnds {
        String units "days since 1980-01-06 00:00:00Z";
        String coordinates "time nv";
    }
    NC_GLOBAL {
        String BeginDate "2022-07-01";
        String BeginTime "00:00:00.000Z";
        String EndDate "2022-07-01";
        String EndTime "23:59:59.999Z";
        String FileHeader "StartGranuleDateTime=2022-07-01T00:00:00.000Z;
StopGranuleDateTime=2022-07-01T23:59:59.999Z";
        String InputPointer "3B-HHR.MS.MRG.3IMERG.20220701-S000000-E002959.0000.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S003000-E005959.0030.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S010000-E012959.0060.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S013000-E015959.0090.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S020000-E022959.0120.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S023000-E025959.0150.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S030000-E032959.0180.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S033000-E035959.0210.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S040000-E042959.0240.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S043000-E045959.0270.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S050000-E052959.0300.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S053000-E055959.0330.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S060000-E062959.0360.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S063000-E065959.0390.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S070000-E072959.0420.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S073000-E075959.0450.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S080000-E082959.0480.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S083000-E085959.0510.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S090000-E092959.0540.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S093000-E095959.0570.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S100000-E102959.0600.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S103000-E105959.0630.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S110000-E112959.0660.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S113000-E115959.0690.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S120000-E122959.0720.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S123000-E125959.0750.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S130000-E132959.0780.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S133000-E135959.0810.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S140000-E142959.0840.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S143000-E145959.0870.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S150000-E152959.0900.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S153000-E155959.0930.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S160000-E162959.0960.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S163000-E165959.0990.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S170000-E172959.1020.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S173000-E175959.1050.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S180000-E182959.1080.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S183000-E185959.1110.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S190000-E192959.1140.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S193000-E195959.1170.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S200000-E202959.1200.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S203000-E205959.1230.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S210000-E212959.1260.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S213000-E215959.1290.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S220000-E222959.1320.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S223000-E225959.1350.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S230000-E232959.1380.V07B.HDF5;3B-HHR.MS.MRG.3IMERG.20220701-S233000-E235959.1410.V07B.HDF5";
        String title "GPM IMERG Final Precipitation L3 1 day 0.1 degree x 0.1 degree (GPM_3IMERGDF)";
        String DOI "10.5067/GPM/IMERGDF/DAY/07";
        String ProductionTime "2024-01-08T16:17:54.249Z";
    }
}
